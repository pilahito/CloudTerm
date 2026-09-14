// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Inicio de sesión con Google y GitHub, y copia de seguridad de los datos.
//!
//! Cada usuario usa **sus propias credenciales de aplicación** (el
//! identificador de cliente que genera en Google Cloud o en GitHub). No se
//! reparte ningún identificador desde aquí: así cada copia de CloudTerm habla
//! con la cuenta de quien la usa, y no hay un intermediario que vea los datos de
//! nadie.
//!
//! Los tokens de acceso se guardan en el **llavero del sistema**, nunca en
//! disco. En el fichero de configuración solo van cosas que no son secretas: el
//! identificador de cliente y los datos públicos de la cuenta.

pub mod github;
pub mod google;
pub mod destinos;
pub mod local;
pub mod pkce;
pub mod totp;
pub mod sync;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Nombre del fichero de configuración (no contiene secretos).
const CONFIG_FILE: &str = "auth.json";

/// Prefijo de las claves del llavero.
const KEYRING_PREFIX: &str = "cloudterm:auth:";

/* -------------------------------------------------------------------------- */
/* Modelos                                                                    */
/* -------------------------------------------------------------------------- */

/// Proveedor de identidad.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthProvider {
    Google,
    GitHub,
}

impl AuthProvider {
    /// Sufijo de la clave del llavero y del fichero.
    pub fn key(self) -> &'static str {
        match self {
            AuthProvider::Google => "google",
            AuthProvider::GitHub => "github",
        }
    }

    /// Nombre para enseñar en la interfaz.
    pub fn label(self) -> &'static str {
        match self {
            AuthProvider::Google => "Google",
            AuthProvider::GitHub => "GitHub",
        }
    }
}

/// Identificadores de cliente configurados por el usuario.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(default)]
    pub google_client_id: String,
    #[serde(default)]
    pub github_client_id: String,
}

impl AuthConfig {
    fn client_id(&self, provider: AuthProvider) -> &str {
        match provider {
            AuthProvider::Google => self.google_client_id.trim(),
            AuthProvider::GitHub => self.github_client_id.trim(),
        }
    }

    /// Asigna el identificador de un proveedor. Solo lo usan las pruebas: en
    /// producción el formulario manda la configuración entera.
    #[cfg(test)]
    fn set_client_id(&mut self, provider: AuthProvider, value: String) {
        match provider {
            AuthProvider::Google => self.google_client_id = value,
            AuthProvider::GitHub => self.github_client_id = value,
        }
    }
}

/// Datos públicos de la cuenta que ha entrado.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub provider: AuthProvider,
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_url: String,
}

/// Tokens de acceso. Se guardan en el llavero, no aquí.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Caducidad en milisegundos desde la época, si el proveedor la indica.
    #[serde(default)]
    pub expires_at: Option<i64>,
    #[serde(default)]
    pub scopes: String,
}

impl Tokens {
    /// ¿Está caducado, o a punto de estarlo?
    ///
    /// Se usa un margen de un minuto para no intentar una petición con un token
    /// que caduca mientras viaja.
    fn is_expired(&self) -> bool {
        const MARGIN_MS: i64 = 60_000;
        match self.expires_at {
            Some(at) => now_ms() + MARGIN_MS >= at,
            None => false,
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Lo que guarda el fichero `auth.json`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAuth {
    #[serde(default)]
    config: AuthConfig,
    #[serde(default)]
    account: Option<Account>,
}

/// Estado que ve la interfaz.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub config: AuthConfig,
    pub account: Option<Account>,
}

/// Lo que se le devuelve a la interfaz al restaurar una copia.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub hosts: usize,
    pub settings: serde_json::Value,
}

/// Estado del gestor: serializa los inicios de sesión.
#[derive(Default)]
pub struct AuthManager {
    /// Solo puede haber un inicio de sesión en curso: dos a la vez compartirían
    /// el puerto de retorno y el usuario vería dos pestañas.
    signing_in: Arc<tokio::sync::Mutex<()>>,
}

/* -------------------------------------------------------------------------- */
/* Persistencia                                                               */
/* -------------------------------------------------------------------------- */

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
    Ok(dir.join(CONFIG_FILE))
}

fn read_stored(app: &AppHandle) -> StoredAuth {
    let Ok(path) = config_path(app) else {
        return StoredAuth::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_stored(app: &AppHandle, stored: &StoredAuth) -> Result<(), String> {
    let path = config_path(app)?;
    let body = serde_json::to_string_pretty(stored)
        .map_err(|err| format!("no se pudo serializar la configuración: {err}"))?;

    // Escritura atómica: un fallo a mitad no deja el fichero roto.
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, body)
        .map_err(|err| format!("no se pudo escribir {}: {err}", temporary.display()))?;
    std::fs::rename(&temporary, &path)
        .map_err(|err| format!("no se pudo reemplazar {}: {err}", path.display()))
}

/* -------------------------------------------------------------------------- */
/* Tokens en el llavero                                                       */
/* -------------------------------------------------------------------------- */

fn token_key(provider: AuthProvider) -> String {
    format!("{KEYRING_PREFIX}{}", provider.key())
}

fn save_tokens(provider: AuthProvider, tokens: &Tokens) -> Result<(), String> {
    let raw = serde_json::to_string(tokens)
        .map_err(|err| format!("no se pudieron serializar los tokens: {err}"))?;
    crate::config::secrets::set_secret(&token_key(provider), &raw)
}

fn load_tokens(provider: AuthProvider) -> Option<Tokens> {
    crate::config::secrets::get_secret(&token_key(provider))
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}

fn drop_tokens(provider: AuthProvider) {
    let _ = crate::config::secrets::delete_secret(&token_key(provider));
}

/// Token de acceso válido, renovándolo si hace falta.
async fn access_token(
    client: &reqwest::Client,
    stored: &StoredAuth,
    provider: AuthProvider,
) -> Result<String, String> {
    let tokens = load_tokens(provider)
        .ok_or_else(|| format!("no hay sesión iniciada con {}", provider.label()))?;

    if !tokens.is_expired() {
        return Ok(tokens.access_token);
    }

    // Solo Google reparte tokens de renovación en este flujo.
    let Some(refresh_token) = tokens.refresh_token.clone() else {
        return Err(format!(
            "la sesión con {} ha caducado; vuelve a iniciar sesión",
            provider.label()
        ));
    };

    if provider != AuthProvider::Google {
        return Err(format!(
            "la sesión con {} ha caducado; vuelve a iniciar sesión",
            provider.label()
        ));
    }

    let client_id = stored.config.client_id(provider);
    let renewed = google::refresh(client, client_id, &refresh_token).await?;

    // Google puede no devolver otro token de renovación: se conserva el actual.
    let merged = Tokens {
        refresh_token: renewed.refresh_token.clone().or(Some(refresh_token)),
        ..renewed
    };
    save_tokens(provider, &merged)?;
    Ok(merged.access_token)
}

/* -------------------------------------------------------------------------- */
/* Interpretación de respuestas                                               */
/* -------------------------------------------------------------------------- */

/// Extrae los tokens de una respuesta del endpoint de Google.
pub fn tokens_from_google(body: &str) -> Result<Tokens, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|err| format!("respuesta ilegible de Google: {err} ({body})"))?;

    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        let detail = value
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(format!("Google rechazó la petición: {error} {detail}"));
    }

    let access_token = value
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Google no devolvió ningún token de acceso".to_string())?
        .to_string();

    let expires_at = value
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .map(|seconds| now_ms() + seconds * 1000);

    Ok(Tokens {
        access_token,
        refresh_token: value
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        expires_at,
        scopes: value
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

/// Configuración y sesión actual.
#[tauri::command]
pub fn auth_state(app: AppHandle) -> AuthState {
    let stored = read_stored(&app);
    AuthState {
        config: stored.config,
        account: stored.account,
    }
}

/// Guarda los identificadores de cliente.
#[tauri::command]
pub fn auth_config_set(app: AppHandle, config: AuthConfig) -> Result<AuthState, String> {
    let mut stored = read_stored(&app);
    stored.config = config;
    write_stored(&app, &stored)?;

    // Cambiar de aplicación de cliente invalida la sesión anterior: los tokens
    // que hubiera son de otra.
    for provider in [AuthProvider::Google, AuthProvider::GitHub] {
        drop_tokens(provider);
    }
    stored.account = None;
    write_stored(&app, &stored)?;

    Ok(AuthState {
        config: stored.config.clone(),
        account: None,
    })
}

/// Inicia sesión con Google: abre el navegador y espera la vuelta.
#[tauri::command]
pub async fn auth_sign_in_google(
    app: AppHandle,
    manager: State<'_, AuthManager>,
) -> Result<Account, String> {
    let _guard = manager.signing_in.lock().await;

    let mut stored = read_stored(&app);
    let client_id = stored.config.client_id(AuthProvider::Google).to_string();
    if client_id.is_empty() {
        return Err(
            "falta el identificador de cliente de Google; créalo en Google Cloud y pégalo aquí"
                .to_string(),
        );
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|err| format!("no se pudo crear el cliente HTTP: {err}"))?;

    let verifier = pkce::verifier();
    let challenge = pkce::challenge(&verifier);
    let expected_state = pkce::state();

    let (port, waiter) = google::listen(expected_state.clone()).await?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let url = google::authorize_url(&client_id, &redirect_uri, &expected_state, &challenge);

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| format!("no se pudo abrir el navegador: {err}"))?;

    let code = waiter
        .await
        .map_err(|err| format!("la espera del navegador se interrumpió: {err}"))??;

    let tokens =
        google::exchange_code(&client, &client_id, &code, &verifier, &redirect_uri).await?;
    let account = google::userinfo(&client, &tokens.access_token).await?;

    save_tokens(AuthProvider::Google, &tokens)?;
    stored.account = Some(account.clone());
    write_stored(&app, &stored)?;

    let _ = app.emit("auth://changed", &account);
    Ok(account)
}

/// Inicia sesión con GitHub mediante el flujo de dispositivo.
#[tauri::command]
pub async fn auth_sign_in_github(
    app: AppHandle,
    manager: State<'_, AuthManager>,
) -> Result<Account, String> {
    let _guard = manager.signing_in.lock().await;

    let mut stored = read_stored(&app);
    let client_id = stored.config.client_id(AuthProvider::GitHub).to_string();
    if client_id.is_empty() {
        return Err(
            "falta el identificador de cliente de GitHub; créalo en tus ajustes de GitHub y pégalo aquí"
                .to_string(),
        );
    }

    let client = github::http_client()?;
    let device = github::start_device_flow(&client, &client_id).await?;

    // La interfaz enseña el código y el enlace.
    let _ = app.emit("auth://device-code", &device);
    let _ = app.opener().open_url(&device.verification_uri, None::<&str>);

    let tokens = github::poll_for_token(&client, &client_id, &device, || {}).await?;
    let account = github::user(&client, &tokens.access_token).await?;

    save_tokens(AuthProvider::GitHub, &tokens)?;
    stored.account = Some(account.clone());
    write_stored(&app, &stored)?;

    let _ = app.emit("auth://changed", &account);
    Ok(account)
}

/// Cierra la sesión del proveedor indicado.
#[tauri::command]
pub fn auth_sign_out(app: AppHandle, provider: AuthProvider) -> Result<AuthState, String> {
    drop_tokens(provider);

    let mut stored = read_stored(&app);
    // Solo se borra la cuenta si la que había era de este proveedor.
    if stored.account.as_ref().map(|a| a.provider) == Some(provider) {
        stored.account = None;
    }
    write_stored(&app, &stored)?;

    let _ = app.emit("auth://signed-out", provider);

    Ok(AuthState {
        config: stored.config,
        account: stored.account,
    })
}

/// Datos que se suben: los hosts de la base local y los ajustes que manda la
/// interfaz (el backend no conoce el estado del frontend).
async fn current_hosts(app: &AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let db = app.state::<crate::db::DbState>();
    let pool = db.pool(app).await?;

    let hosts: Vec<crate::db::Host> = sqlx::query_as(
        "SELECT * FROM hosts ORDER BY group_name COLLATE NOCASE, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
    .map_err(|err| format!("no se pudieron leer los hosts: {err}"))?;

    hosts
        .iter()
        .map(|host| {
            serde_json::to_value(host)
                .map_err(|err| format!("no se pudo convertir un host: {err}"))
        })
        .collect()
}

/// Sube una copia de los hosts y los ajustes.
#[tauri::command]
pub async fn auth_sync_push(
    app: AppHandle,
    settings: serde_json::Value,
) -> Result<sync::SyncOutcome, String> {
    let stored = read_stored(&app);
    let destino = destinos::leer(&app);
    let hosts = current_hosts(&app).await?;
    let payload = sync::build(hosts, settings)?;

    // Los destinos que no son de nube no necesitan cuenta: se guardan y ya.
    if !destino.activo.necesita_sesion() {
        destino.revisar()?;
        let donde = destinos::subir(&app, &payload, &destino).await?;
        return Ok(sync::SyncOutcome {
            provider: format!("{:?}", destino.activo).to_lowercase(),
            action: "guardada".to_string(),
            hosts: sync::parse(&payload).map(|b| b.hosts.len()).unwrap_or(0),
            destination: donde,
        });
    }

    let account = stored
        .account
        .clone()
        .ok_or_else(|| "no hay ninguna sesión iniciada".to_string())?;

    let client = reqwest::Client::builder()
        .user_agent(github::USER_AGENT)
        .build()
        .map_err(|err| format!("no se pudo crear el cliente HTTP: {err}"))?;

    let token = access_token(&client, &stored, account.provider).await?;

    match account.provider {
        AuthProvider::Google => sync::push_drive(&client, &token, &payload).await,
        AuthProvider::GitHub => sync::push_gist(&client, &token, &payload).await,
    }
}

/// Restaura la copia: reemplaza los hosts locales por los de la nube.
#[tauri::command]
pub async fn auth_sync_pull(app: AppHandle) -> Result<RestoreOutcome, String> {
    let stored = read_stored(&app);
    let destino = destinos::leer(&app);

    // Igual que al subir: los destinos propios no pasan por ninguna cuenta.
    if !destino.activo.necesita_sesion() {
        destino.revisar()?;
        let bruto = destinos::bajar(&app, &destino).await?;
        let copia = sync::parse(&bruto)?;
        replace_hosts(&app, &copia.hosts).await?;
        return Ok(RestoreOutcome {
            hosts: copia.hosts.len(),
            settings: copia.settings,
        });
    }

    let account = stored
        .account
        .clone()
        .ok_or_else(|| "no hay ninguna sesión iniciada".to_string())?;

    let client = reqwest::Client::builder()
        .user_agent(github::USER_AGENT)
        .build()
        .map_err(|err| format!("no se pudo crear el cliente HTTP: {err}"))?;

    let token = access_token(&client, &stored, account.provider).await?;

    let backup = match account.provider {
        AuthProvider::Google => sync::pull_drive(&client, &token).await?,
        AuthProvider::GitHub => sync::pull_gist(&client, &token).await?,
    };

    replace_hosts(&app, &backup.hosts).await?;

    Ok(RestoreOutcome {
        hosts: backup.hosts.len(),
        settings: backup.settings,
    })
}

/// Sustituye la tabla de hosts por la de la copia, en una transacción.
async fn replace_hosts(app: &AppHandle, hosts: &[serde_json::Value]) -> Result<(), String> {
    let db = app.state::<crate::db::DbState>();
    let pool = db.pool(app).await?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|err| format!("no se pudo abrir la transacción: {err}"))?;

    sqlx::query("DELETE FROM hosts")
        .execute(&mut *tx)
        .await
        .map_err(|err| format!("no se pudieron limpiar los hosts: {err}"))?;

    for host in hosts {
        let text = |key: &str| {
            host.get(key)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string()
        };
        let number = |key: &str, fallback: i64| {
            host.get(key).and_then(|v| v.as_i64()).unwrap_or(fallback)
        };

        sqlx::query(
            r#"INSERT INTO hosts
               (id, name, host, port, username, protocol, group_name,
                auth_method, private_key_path, use_agent, timeout_ms,
                created_at, last_used_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(text("id"))
        .bind(text("name"))
        .bind(text("host"))
        .bind(number("port", 22))
        .bind(text("username"))
        .bind(text("protocol"))
        .bind(text("group"))
        .bind(text("authMethod"))
        .bind(text("privateKeyPath"))
        .bind(number("useAgent", 0))
        .bind(number("timeoutMs", 60_000))
        .bind(number("createdAt", now_ms()))
        .bind(host.get("lastUsedAt").and_then(|v| v.as_i64()))
        .execute(&mut *tx)
        .await
        .map_err(|err| format!("no se pudo restaurar un host: {err}"))?;
    }

    tx.commit()
        .await
        .map_err(|err| format!("no se pudo confirmar la restauración: {err}"))?;

    let _ = app.emit("hosts://changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn google_body() -> String {
        serde_json::json!({
            "access_token": "ya29.abc",
            "expires_in": 3600,
            "refresh_token": "1//refresh",
            "scope": "openid email https://www.googleapis.com/auth/drive.appdata",
            "token_type": "Bearer"
        })
        .to_string()
    }

    #[test]
    fn parses_a_google_token_response() {
        let tokens = tokens_from_google(&google_body()).expect("debería interpretarlo");
        assert_eq!(tokens.access_token, "ya29.abc");
        assert_eq!(tokens.refresh_token.as_deref(), Some("1//refresh"));
        assert!(tokens.expires_at.is_some());
        assert!(tokens.scopes.contains("drive.appdata"));
    }

    #[test]
    fn a_google_error_is_reported() {
        let body = r#"{"error":"invalid_grant","error_description":"bad code"}"#;
        let err = tokens_from_google(body).unwrap_err();
        assert!(err.contains("invalid_grant"), "{err}");
    }

    #[test]
    fn a_response_without_a_token_is_an_error() {
        let err = tokens_from_google(r#"{"scope":"openid"}"#).unwrap_err();
        assert!(err.contains("token de acceso"), "{err}");
    }

    /// Un token con caducidad lejana está vigente; uno ya pasado, no.
    #[test]
    fn expiry_is_detected_with_a_margin() {
        let vigente = Tokens {
            access_token: "x".into(),
            refresh_token: None,
            expires_at: Some(now_ms() + 3_600_000),
            scopes: String::new(),
        };
        assert!(!vigente.is_expired());

        let caducado = Tokens {
            expires_at: Some(now_ms() - 1),
            ..vigente.clone()
        };
        assert!(caducado.is_expired());

        // A menos de un minuto se considera caducado, para no usarlo mientras
        // viaja la petición.
        let al_limite = Tokens {
            expires_at: Some(now_ms() + 30_000),
            ..vigente.clone()
        };
        assert!(al_limite.is_expired());
    }

    /// Sin fecha de caducidad no se considera caducado: GitHub no la da.
    #[test]
    fn a_token_without_expiry_never_expires_on_its_own() {
        let tokens = Tokens {
            access_token: "gho_x".into(),
            refresh_token: None,
            expires_at: None,
            scopes: "gist".into(),
        };
        assert!(!tokens.is_expired());
    }

    #[test]
    fn provider_keys_match_the_wire_format() {
        assert_eq!(AuthProvider::Google.key(), "google");
        assert_eq!(AuthProvider::GitHub.key(), "github");

        // El nombre viaja en minúsculas y vuelve como variante.
        let parsed: AuthProvider = serde_json::from_str("\"github\"").unwrap();
        assert_eq!(parsed, AuthProvider::GitHub);
    }

    #[test]
    fn config_client_ids_are_trimmed() {
        let mut config = AuthConfig::default();
        config.set_client_id(AuthProvider::Google, "  mi-id  ".to_string());
        assert_eq!(config.client_id(AuthProvider::Google), "mi-id");
        assert_eq!(config.client_id(AuthProvider::GitHub), "");
    }
}
