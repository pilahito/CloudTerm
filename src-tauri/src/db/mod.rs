//! Almacén local de CloudTerm sobre SQLite, mediante `sqlx`.
//!
//! Dos tablas:
//!
//! * `hosts` — las conexiones guardadas (CRUD completo).
//! * `settings_kv` — pares clave/valor para estado suelto.
//!
//! El pool se crea de forma perezosa la primera vez que un comando lo necesita
//! (`OnceCell::get_or_try_init`), así no hace falta un hook `setup` que bloquee
//! el arranque de la ventana.

pub mod ssh_config;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use tauri::{AppHandle, Manager, State};
use tokio::sync::OnceCell;

/* -------------------------------------------------------------------------- */
/* Modelos                                                                    */
/* -------------------------------------------------------------------------- */

/// Una conexión guardada.
///
/// `group` es palabra reservada en SQL, de ahí la columna `group_name`; hacia el
/// frontend se sigue exponiendo como `group`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Host {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub protocol: String,
    #[serde(rename = "group")]
    pub group_name: String,
    pub auth_method: String,
    pub private_key_path: String,
    pub use_agent: bool,
    /// Presupuesto para el handshake SSH, en milisegundos.
    ///
    /// Algunos servidores tardan decenas de segundos en enviar el banner
    /// (por ejemplo con `UseDNS yes` y un DNS inverso lento), así que cada
    /// host puede ajustarlo.
    pub timeout_ms: i64,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
}

/// Presupuesto por defecto del handshake: 60 s.
///
/// Es holgado a propósito: el caso normal es de milisegundos, y quedarse
/// corto solo produce fallos difíciles de diagnosticar.
pub(crate) fn default_timeout_ms() -> i64 {
    60_000
}

fn default_protocol() -> String {
    "ssh".to_string()
}

fn default_group() -> String {
    "General".to_string()
}

fn default_auth() -> String {
    "key".to_string()
}

fn default_port() -> i64 {
    22
}

/// Datos de entrada para crear o importar un host (sin id ni marcas de tiempo).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInput {
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: i64,
    #[serde(default)]
    pub username: String,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    #[serde(default = "default_group", rename = "group")]
    pub group_name: String,
    #[serde(default = "default_auth")]
    pub auth_method: String,
    #[serde(default)]
    pub private_key_path: String,
    #[serde(default)]
    pub use_agent: bool,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: i64,
}

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

/// Estado que Tauri inyecta con `manage`.
#[derive(Default)]
pub struct DbState {
    pool: OnceCell<SqlitePool>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("host-{nanos:x}")
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de datos: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
    Ok(dir.join("cloudterm.db"))
}

/// Opciones de conexión a la base local.
fn connect_options(path: &std::path::Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
}

/// Abre la base y deja el esquema al día.
///
/// La migración corre en una conexión propia que se cierra **antes** de crear
/// el pool. Si se migrara sobre el pool vivo, alguna de sus conexiones podría
/// conservar los metadatos del esquema anterior —un `ALTER TABLE` añade una
/// columna nueva— y reventar al leer las filas con el modelo actualizado.
pub async fn open_database(path: &std::path::Path) -> Result<SqlitePool, String> {
    let options = connect_options(path);

    let bootstrap = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .map_err(|err| format!("no se pudo abrir {}: {err}", path.display()))?;
    let migrated = migrate(&bootstrap).await;
    bootstrap.close().await;
    migrated?;

    SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .map_err(|err| format!("no se pudo abrir {}: {err}", path.display()))
}

impl DbState {
    /// Devuelve el pool, creándolo y migrando la base la primera vez.
    pub async fn pool(&self, app: &AppHandle) -> Result<&SqlitePool, String> {
        self.pool
            .get_or_try_init(|| async { open_database(&db_path(app)?).await })
            .await
    }
}

/// Crea el esquema si no existe. Sentencia a sentencia: SQLite no admite varias
/// instrucciones dentro de un mismo `execute`.
async fn migrate(pool: &SqlitePool) -> Result<(), String> {
    const STATEMENTS: [&str; 5] = [
        r#"CREATE TABLE IF NOT EXISTS hosts (
            id               TEXT PRIMARY KEY,
            name             TEXT    NOT NULL,
            host             TEXT    NOT NULL,
            port             INTEGER NOT NULL DEFAULT 22,
            username         TEXT    NOT NULL DEFAULT '',
            protocol         TEXT    NOT NULL DEFAULT 'ssh',
            group_name       TEXT    NOT NULL DEFAULT 'General',
            auth_method      TEXT    NOT NULL DEFAULT 'key',
            private_key_path TEXT    NOT NULL DEFAULT '',
            use_agent        INTEGER NOT NULL DEFAULT 0,
            timeout_ms       INTEGER NOT NULL DEFAULT 60000,
            created_at       INTEGER NOT NULL,
            last_used_at     INTEGER
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_hosts_group ON hosts (group_name)",
        "CREATE INDEX IF NOT EXISTS idx_hosts_endpoint ON hosts (host, port, username)",
        r#"CREATE TABLE IF NOT EXISTS settings_kv (
            key        TEXT PRIMARY KEY,
            value      TEXT    NOT NULL,
            updated_at INTEGER NOT NULL
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_kv_updated ON settings_kv (updated_at)",
    ];

    for statement in STATEMENTS {
        sqlx::query(statement)
            .execute(pool)
            .await
            .map_err(|err| format!("error migrando la base local: {err}"))?;
    }

    // Bases creadas antes de que existiera `timeout_ms`: se añade la columna.
    // `ALTER TABLE` no admite `IF NOT EXISTS` en SQLite, así que el error de
    // columna duplicada es el caso normal en instalaciones ya migradas.
    if let Err(err) = sqlx::query("ALTER TABLE hosts ADD COLUMN timeout_ms INTEGER NOT NULL DEFAULT 60000")
        .execute(pool)
        .await
    {
        let text = err.to_string();
        if !text.contains("duplicate column name") {
            return Err(format!("error migrando la base local: {text}"));
        }
    }

    Ok(())
}

fn row_to_host(id: String, input: HostInput, created_at: i64, last_used_at: Option<i64>) -> Host {
    Host {
        id,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        protocol: input.protocol,
        group_name: input.group_name,
        auth_method: input.auth_method,
        private_key_path: input.private_key_path,
        use_agent: input.use_agent,
        timeout_ms: input.timeout_ms,
        created_at,
        last_used_at,
    }
}

async fn insert_host(pool: &SqlitePool, host: &Host) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO hosts
           (id, name, host, port, username, protocol, group_name,
            auth_method, private_key_path, use_agent, timeout_ms,
            created_at, last_used_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&host.id)
    .bind(&host.name)
    .bind(&host.host)
    .bind(host.port)
    .bind(&host.username)
    .bind(&host.protocol)
    .bind(&host.group_name)
    .bind(&host.auth_method)
    .bind(&host.private_key_path)
    .bind(host.use_agent)
    .bind(host.timeout_ms)
    .bind(host.created_at)
    .bind(host.last_used_at)
    .execute(pool)
    .await
    .map_err(|err| format!("no se pudo guardar «{}»: {err}", host.name))?;
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* CRUD de hosts                                                              */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub async fn hosts_list(app: AppHandle, state: State<'_, DbState>) -> Result<Vec<Host>, String> {
    let pool = state.pool(&app).await?;
    sqlx::query_as::<_, Host>(
        "SELECT * FROM hosts ORDER BY group_name COLLATE NOCASE, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
    .map_err(|err| format!("no se pudieron listar los hosts: {err}"))
}

#[tauri::command]
pub async fn hosts_create(
    app: AppHandle,
    state: State<'_, DbState>,
    input: HostInput,
) -> Result<Host, String> {
    if input.name.trim().is_empty() || input.host.trim().is_empty() {
        return Err("el nombre y el host son obligatorios".to_string());
    }
    let pool = state.pool(&app).await?;
    let host = row_to_host(new_id(), input, now_ms(), None);
    insert_host(pool, &host).await?;
    Ok(host)
}

#[tauri::command]
pub async fn hosts_update(
    app: AppHandle,
    state: State<'_, DbState>,
    host: Host,
) -> Result<Host, String> {
    let pool = state.pool(&app).await?;
    let affected = sqlx::query(
        r#"UPDATE hosts SET
             name = ?, host = ?, port = ?, username = ?, protocol = ?,
             group_name = ?, auth_method = ?, private_key_path = ?,
             use_agent = ?, timeout_ms = ?, last_used_at = ?
           WHERE id = ?"#,
    )
    .bind(&host.name)
    .bind(&host.host)
    .bind(host.port)
    .bind(&host.username)
    .bind(&host.protocol)
    .bind(&host.group_name)
    .bind(&host.auth_method)
    .bind(&host.private_key_path)
    .bind(host.use_agent)
    .bind(host.timeout_ms)
    .bind(host.last_used_at)
    .bind(&host.id)
    .execute(pool)
    .await
    .map_err(|err| format!("no se pudo actualizar «{}»: {err}", host.name))?
    .rows_affected();

    if affected == 0 {
        return Err(format!("no existe el host {}", host.id));
    }
    Ok(host)
}

#[tauri::command]
pub async fn hosts_delete(
    app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let pool = state.pool(&app).await?;
    sqlx::query("DELETE FROM hosts WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|err| format!("no se pudo borrar el host {id}: {err}"))?;
    Ok(())
}

/// Marca un host como usado ahora mismo.
#[tauri::command]
pub async fn hosts_touch(
    app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let pool = state.pool(&app).await?;
    sqlx::query("UPDATE hosts SET last_used_at = ? WHERE id = ?")
        .bind(now_ms())
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|err| format!("no se pudo marcar el host {id}: {err}"))?;
    Ok(())
}

/// Inserta un lote de hosts (lo usa la importación de `~/.ssh/config`).
///
/// Se saltan los que ya existan con la misma terna host/puerto/usuario, de modo
/// que importar dos veces no duplica nada.
#[tauri::command]
pub async fn hosts_import(
    app: AppHandle,
    state: State<'_, DbState>,
    hosts: Vec<HostInput>,
) -> Result<Vec<Host>, String> {
    let pool = state.pool(&app).await?;
    let mut imported = Vec::new();
    let now = now_ms();

    for input in hosts {
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM hosts WHERE host = ? AND port = ? AND username = ? LIMIT 1",
        )
        .bind(&input.host)
        .bind(input.port)
        .bind(&input.username)
        .fetch_optional(pool)
        .await
        .map_err(|err| format!("no se pudo comprobar duplicados: {err}"))?;

        if existing.is_some() {
            continue;
        }

        let host = row_to_host(new_id(), input, now, None);
        insert_host(pool, &host).await?;
        imported.push(host);
    }

    Ok(imported)
}

/* -------------------------------------------------------------------------- */
/* Pares clave/valor                                                          */
/* -------------------------------------------------------------------------- */

async fn kv_get(pool: &SqlitePool, key: &str) -> Result<Option<String>, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings_kv WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|err| format!("no se pudo leer «{key}»: {err}"))?;
    Ok(row.map(|(value,)| value))
}

async fn kv_set(pool: &SqlitePool, key: &str, raw: &str) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO settings_kv (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"#,
    )
    .bind(key)
    .bind(raw)
    .bind(now_ms())
    .execute(pool)
    .await
    .map_err(|err| format!("no se pudo guardar «{key}»: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn db_get(
    app: AppHandle,
    state: State<'_, DbState>,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    let pool = state.pool(&app).await?;
    match kv_get(pool, &key).await? {
        Some(raw) => Ok(serde_json::from_str(&raw).ok()),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn db_set(
    app: AppHandle,
    state: State<'_, DbState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let pool = state.pool(&app).await?;
    let raw = serde_json::to_string(&value)
        .map_err(|err| format!("no se pudo serializar el valor: {err}"))?;
    kv_set(pool, &key, &raw).await
}

#[tauri::command]
pub async fn db_keys(app: AppHandle, state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let pool = state.pool(&app).await?;
    let rows: Vec<(String,)> = sqlx::query_as("SELECT key FROM settings_kv ORDER BY key")
        .fetch_all(pool)
        .await
        .map_err(|err| format!("no se pudieron listar las claves: {err}"))?;
    Ok(rows.into_iter().map(|(key,)| key).collect())
}

/// Ruta del fichero SQLite, para mostrarla en Ajustes.
#[tauri::command]
pub fn db_location(app: AppHandle) -> Result<String, String> {
    Ok(db_path(&app)?.to_string_lossy().to_string())
}

/* -------------------------------------------------------------------------- */
/* Pruebas del esquema (sin Tauri, con SQLite en memoria)                     */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    async fn memory_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("pool SQLite en memoria");
        migrate(&pool).await.expect("migración");
        pool
    }

    fn sample(name: &str, host: &str) -> HostInput {
        HostInput {
            name: name.to_string(),
            host: host.to_string(),
            port: 2222,
            username: "deploy".to_string(),
            protocol: "ssh".to_string(),
            group_name: "Producción".to_string(),
            auth_method: "key".to_string(),
            private_key_path: "~/.ssh/id_prod".to_string(),
            use_agent: true,
            timeout_ms: 45_000,
        }
    }

    #[tokio::test]
    async fn migrates_and_round_trips_a_host() {
        let pool = memory_pool().await;
        let host = row_to_host("host-1".to_string(), sample("Producción", "prod.example.com"), 1_000, None);
        insert_host(&pool, &host).await.expect("insertar");

        let listed: Vec<Host> = sqlx::query_as::<_, Host>("SELECT * FROM hosts")
            .fetch_all(&pool)
            .await
            .expect("listar");

        assert_eq!(listed.len(), 1);
        let stored = &listed[0];
        assert_eq!(stored.id, "host-1");
        assert_eq!(stored.name, "Producción");
        assert_eq!(stored.host, "prod.example.com");
        assert_eq!(stored.port, 2222);
        assert_eq!(stored.group_name, "Producción");
        assert_eq!(stored.auth_method, "key");
        // El booleano viaja como INTEGER y vuelve como bool.
        assert!(stored.use_agent);
        // El presupuesto del handshake sobrevive al ida y vuelta.
        assert_eq!(stored.timeout_ms, 45_000);
        assert_eq!(stored.created_at, 1_000);
        assert!(stored.last_used_at.is_none());
    }

    /// Ruta única para una base de prueba en disco.
    ///
    /// Se usa un fichero, y no `:memory:`, porque con varias conexiones en
    /// memoria cada una vería una base distinta.
    fn temp_db_path(tag: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("cloudterm-test-{tag}-{nanos}.db"))
    }

    /// Una base creada antes de que existiera `timeout_ms` debe migrarse sola.
    ///
    /// Ejercita el mismo camino que usa la aplicación al arrancar
    /// (`open_database`), que migra en una conexión aparte y la cierra antes de
    /// crear el pool.
    #[tokio::test]
    async fn adds_the_timeout_column_to_an_old_database() {
        let db = temp_db_path("migracion-antigua");

        // 1. Se crea a mano una base con el esquema antiguo, sin `timeout_ms`.
        {
            let old = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(connect_options(&db))
                .await
                .expect("pool SQLite");

            sqlx::query(
                r#"CREATE TABLE hosts (
                    id               TEXT PRIMARY KEY,
                    name             TEXT    NOT NULL,
                    host             TEXT    NOT NULL,
                    port             INTEGER NOT NULL DEFAULT 22,
                    username         TEXT    NOT NULL DEFAULT '',
                    protocol         TEXT    NOT NULL DEFAULT 'ssh',
                    group_name       TEXT    NOT NULL DEFAULT 'General',
                    auth_method      TEXT    NOT NULL DEFAULT 'key',
                    private_key_path TEXT    NOT NULL DEFAULT '',
                    use_agent        INTEGER NOT NULL DEFAULT 0,
                    created_at       INTEGER NOT NULL,
                    last_used_at     INTEGER
                )"#,
            )
            .execute(&old)
            .await
            .expect("esquema antiguo");

            sqlx::query(
                "INSERT INTO hosts (id, name, host, port, username, created_at)
                 VALUES ('viejo', 'Servidor de prueba', '192.0.2.10', 2220, 'demo', 1)",
            )
            .execute(&old)
            .await
            .expect("fila antigua");

            old.close().await;
        }

        // 2. Se abre como lo hace la aplicación: migra y devuelve el pool.
        let pool = open_database(&db).await.expect("abrir la base");

        let stored: Host = sqlx::query_as::<_, Host>("SELECT * FROM hosts WHERE id = 'viejo'")
            .fetch_one(&pool)
            .await
            .expect("leer");

        // El host antiguo hereda el valor por defecto, no cero.
        assert_eq!(stored.timeout_ms, default_timeout_ms());
        assert_eq!(stored.host, "192.0.2.10");
        assert_eq!(stored.port, 2220);
        assert_eq!(stored.username, "david");

        // 3. Reabrir no debe fallar: la migración es idempotente.
        pool.close().await;
        let again = open_database(&db).await.expect("reabrir la base");
        again.close().await;

        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", db.display()));
        }
    }

    /// Un host guardado con el esquema nuevo sobrevive a una reapertura.
    #[tokio::test]
    async fn a_migrated_database_round_trips_hosts() {
        let db = temp_db_path("ida-y-vuelta");

        let pool = open_database(&db).await.expect("abrir la base");
        let host = row_to_host(
            "host-1".to_string(),
            sample("Servidor de prueba", "192.0.2.10"),
            1_000,
            None,
        );
        insert_host(&pool, &host).await.expect("insertar");
        pool.close().await;

        let reopened = open_database(&db).await.expect("reabrir la base");
        let stored: Host = sqlx::query_as::<_, Host>("SELECT * FROM hosts")
            .fetch_one(&reopened)
            .await
            .expect("leer");

        assert_eq!(stored.timeout_ms, 45_000);
        assert_eq!(stored.host, "192.0.2.10");
        reopened.close().await;

        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", db.display()));
        }
    }

    #[tokio::test]
    async fn primary_key_rejects_duplicates() {
        let pool = memory_pool().await;
        let host = row_to_host("host-1".to_string(), sample("A", "a.example.com"), 1, None);
        insert_host(&pool, &host).await.expect("primera inserción");

        let duplicate = row_to_host("host-1".to_string(), sample("B", "b.example.com"), 2, None);
        assert!(
            insert_host(&pool, &duplicate).await.is_err(),
            "el mismo id no debería poder insertarse dos veces"
        );
    }

    #[tokio::test]
    async fn ordering_groups_then_names_case_insensitively() {
        let pool = memory_pool().await;
        for (id, group, name) in [
            ("h1", "zeta", "nodo-b"),
            ("h2", "Alfa", "nodo-c"),
            ("h3", "Alfa", "nodo-a"),
        ] {
            let mut input = sample(name, &format!("{id}.example.com"));
            input.group_name = group.to_string();
            insert_host(&pool, &row_to_host(id.to_string(), input, 1, None))
                .await
                .expect("insertar");
        }

        let listed: Vec<Host> = sqlx::query_as::<_, Host>(
            "SELECT * FROM hosts ORDER BY group_name COLLATE NOCASE, name COLLATE NOCASE",
        )
        .fetch_all(&pool)
        .await
        .expect("listar");

        let order: Vec<&str> = listed.iter().map(|h| h.name.as_str()).collect();
        assert_eq!(order, vec!["nodo-a", "nodo-c", "nodo-b"]);
    }

    #[tokio::test]
    async fn kv_upsert_overwrites_the_previous_value() {
        let pool = memory_pool().await;
        kv_set(&pool, "tema", "\"neon\"").await.expect("guardar");
        assert_eq!(kv_get(&pool, "tema").await.unwrap().as_deref(), Some("\"neon\""));

        kv_set(&pool, "tema", "\"nord\"").await.expect("sobrescribir");
        assert_eq!(kv_get(&pool, "tema").await.unwrap().as_deref(), Some("\"nord\""));

        assert!(kv_get(&pool, "inexistente").await.unwrap().is_none());
    }
}
