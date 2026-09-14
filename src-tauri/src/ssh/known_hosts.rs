// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Verificación de claves de servidor contra un fichero `known_hosts` propio.
//!
//! Sin esto, `check_server_key` aceptaba cualquier clave y un atacante en medio
//! podía hacerse pasar por el servidor. Es el riesgo de seguridad número uno del
//! proyecto.
//!
//! El formato es el de OpenSSH, una línea por clave:
//!
//! ```text
//! [servidor.example.com]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1... 
//! otro.example.com ssh-rsa AAAAB3NzaC1yc2E...
//! ```
//!
//! El puerto 22 se omite (como hace OpenSSH); cualquier otro va entre corchetes.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use russh::keys::{HashAlg, PublicKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Puerto por defecto, que se omite al escribir la entrada.
const DEFAULT_PORT: u16 = 22;

/// Resultado de comprobar una clave de servidor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum HostKeyStatus {
    /// La clave coincide con la guardada.
    Match,
    /// El host no está en el fichero: primera conexión.
    New,
    /// El host está, pero con otra clave. Puede ser un ataque de intermediario.
    Mismatch { old_fingerprint: String },
}

/// Una entrada del fichero, ya interpretada.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostEntry {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    /// Blob base64 de la clave, sin el tipo.
    pub key: String,
    /// Huella legible tipo `SHA256:AbC123...`.
    pub fingerprint: String,
}

/* -------------------------------------------------------------------------- */
/* Utilidades de formato                                                      */
/* -------------------------------------------------------------------------- */

/// Clave con la que se indexa una entrada: `host` o `[host]:puerto`.
pub fn host_key(host: &str, port: u16) -> String {
    if port == DEFAULT_PORT {
        host.to_string()
    } else {
        format!("[{host}]:{port}")
    }
}

/// Clave interna de una entrada: host, puerto **y tipo de clave**.
///
/// El tipo forma parte de la identidad porque un mismo servidor ofrece a la vez
/// su clave ed25519, su RSA y su ECDSA: son tres entradas distintas, igual que
/// en el `known_hosts` de OpenSSH. Indexar solo por host y puerto hacía que una
/// sobrescribiera a las demás y que una clave legítima de otro algoritmo se
/// confundiera con un cambio de clave.
fn entry_key(host: &str, port: u16, key_type: &str) -> String {
    format!("{} {key_type}", host_key(host, port))
}

/// Separa `[host]:puerto` o `host` en sus dos partes.
pub fn split_host_key(key: &str) -> (String, u16) {
    if let Some(rest) = key.strip_prefix('[') {
        if let Some((host, port)) = rest.split_once("]:") {
            if let Ok(port) = port.parse::<u16>() {
                return (host.to_string(), port);
            }
        }
    }
    (key.to_string(), DEFAULT_PORT)
}

/// Huella SHA256 en el formato que muestra OpenSSH: `SHA256:<base64>`.
pub fn fingerprint(key: &PublicKey) -> String {
    key.fingerprint(HashAlg::Sha256).to_string()
}

/// Tipo y blob base64 de una clave pública.
fn key_parts(key: &PublicKey) -> Result<(String, String), String> {
    let openssh = key
        .to_openssh()
        .map_err(|err| format!("no se pudo serializar la clave: {err}"))?;
    let mut parts = openssh.split_whitespace();
    let key_type = parts.next().unwrap_or_default().to_string();
    let blob = parts.next().unwrap_or_default().to_string();
    if key_type.is_empty() || blob.is_empty() {
        return Err("clave pública con formato inesperado".to_string());
    }
    Ok((key_type, blob))
}

/// Tipo y blob base64 de una clave pública, para los avisos al usuario.
/// No falla: si la clave no se puede serializar devuelve un tipo genérico.
pub fn key_parts_for_prompt(key: &PublicKey) -> (String, String) {
    key_parts(key).unwrap_or_else(|_| ("desconocido".to_string(), String::new()))
}

/// Interpreta una línea del fichero. Devuelve `None` para comentarios, líneas
/// vacías y entradas con hash (`|1|...`), que no se pueden casar por nombre.
pub fn parse_line(line: &str) -> Option<KnownHostEntry> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('|') {
        return None;
    }

    let mut parts = trimmed.split_whitespace();
    let host_field = parts.next()?;
    let key_type = parts.next()?.to_string();
    let key = parts.next()?.to_string();

    let (host, port) = split_host_key(host_field);
    Some(KnownHostEntry {
        host,
        port,
        key_type,
        fingerprint: String::new(), // se rellena al leer, calculándola del blob
        key,
    })
}

/// Línea tal y como se escribe en el fichero.
fn render_line(entry: &KnownHostEntry) -> String {
    format!(
        "{} {} {}",
        host_key(&entry.host, entry.port),
        entry.key_type,
        entry.key
    )
}

/// Calcula la huella a partir del blob base64, sin necesitar la clave entera.
fn fingerprint_of_blob(key_type: &str, blob: &str) -> String {
    match PublicKey::from_openssh(&format!("{key_type} {blob}")) {
        Ok(key) => fingerprint(&key),
        // Si el blob no se puede interpretar se deja vacío en vez de mentir.
        Err(_) => String::new(),
    }
}

/* -------------------------------------------------------------------------- */
/* Almacén                                                                    */
/* -------------------------------------------------------------------------- */

/// Fichero `known_hosts` propio de CloudTerm.
#[derive(Debug, Clone)]
pub struct KnownHosts {
    path: PathBuf,
}

impl KnownHosts {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Ruta por defecto, dentro del directorio de configuración de la aplicación.
    pub fn default_path(app: &AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_config_dir()
            .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?;
        std::fs::create_dir_all(&dir)
            .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
        Ok(dir.join("known_hosts"))
    }

    /// Construye el almacén en la ruta por defecto.
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        Ok(Self::new(Self::default_path(app)?))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Lee el fichero y devuelve sus entradas indexadas por host, puerto y tipo
    /// de clave.
    pub fn entries(&self) -> Result<BTreeMap<String, KnownHostEntry>, String> {
        if !self.path.exists() {
            return Ok(BTreeMap::new());
        }
        let raw = std::fs::read_to_string(&self.path)
            .map_err(|err| format!("no se pudo leer {}: {err}", self.path.display()))?;

        let mut map = BTreeMap::new();
        for line in raw.lines() {
            if let Some(mut entry) = parse_line(line) {
                entry.fingerprint = fingerprint_of_blob(&entry.key_type, &entry.key);
                map.insert(
                    entry_key(&entry.host, entry.port, &entry.key_type),
                    entry,
                );
            }
        }
        Ok(map)
    }

    /// Entradas ordenadas por host y puerto, para mostrarlas en la interfaz.
    pub fn list(&self) -> Result<Vec<KnownHostEntry>, String> {
        let mut entries: Vec<KnownHostEntry> = self.entries()?.into_values().collect();
        entries.sort_by(|a, b| a.host.cmp(&b.host).then(a.port.cmp(&b.port)));
        Ok(entries)
    }

    /// Comprueba la clave que presenta un servidor.
    ///
    /// La comparación es por host, puerto **y tipo de clave**. Si el servidor
    /// negocia un algoritmo del que todavía no hay entrada se trata como primera
    /// vez (`New`), no como un cambio de clave: un servidor que empieza a ofrecer
    /// ECDSA además de ed25519 no es un ataque.
    pub fn check(&self, host: &str, port: u16, key: &PublicKey) -> Result<HostKeyStatus, String> {
        let entries = self.entries()?;
        let (key_type, blob) = key_parts(key)?;

        // Se prueban las dos formas: por si la entrada se guardó sin puerto
        // explícito y ahora se consulta con puerto, o al revés.
        let found = entries
            .get(&entry_key(host, port, &key_type))
            .or_else(|| {
                entries
                    .values()
                    .find(|entry| {
                        entry.host == host && entry.port == port && entry.key_type == key_type
                    })
            });

        let Some(entry) = found else {
            return Ok(HostKeyStatus::New);
        };

        if entry.key == blob {
            Ok(HostKeyStatus::Match)
        } else {
            Ok(HostKeyStatus::Mismatch {
                old_fingerprint: entry.fingerprint.clone(),
            })
        }
    }

    /// Añade o reemplaza la entrada de un host **para ese tipo de clave**.
    ///
    /// Las claves de otros algoritmos del mismo host se conservan. Escritura
    /// atómica.
    pub fn add(&self, host: &str, port: u16, key: &PublicKey) -> Result<KnownHostEntry, String> {
        let (key_type, blob) = key_parts(key)?;
        let entry = KnownHostEntry {
            host: host.to_string(),
            port,
            key_type,
            key: blob,
            fingerprint: fingerprint(key),
        };

        let mut entries = self.entries()?;
        entries.insert(entry_key(host, port, &entry.key_type), entry.clone());
        self.write_all(entries.into_values().collect())?;
        Ok(entry)
    }

    /// Borra **todas** las claves de un host, sea cual sea su tipo.
    /// Devuelve `true` si existía alguna.
    pub fn remove(&self, host: &str, port: u16) -> Result<bool, String> {
        let mut entries = self.entries()?;
        let before = entries.len();
        entries.retain(|_, entry| !(entry.host == host && entry.port == port));

        let removed = entries.len() != before;
        if removed {
            self.write_all(entries.into_values().collect())?;
        }
        Ok(removed)
    }

    /// Vacía el fichero.
    pub fn clear(&self) -> Result<(), String> {
        self.write_all(Vec::new())
    }

    /// Reescribe el fichero completo. Se escribe a un temporal y se renombra,
    /// para que un fallo a mitad no deje el fichero a medias.
    fn write_all(&self, entries: Vec<KnownHostEntry>) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("no se pudo crear {}: {err}", parent.display()))?;
        }

        let body: String = entries.iter().map(|e| format!("{}\n", render_line(e))).collect();
        let temporary = self.path.with_extension("tmp");

        std::fs::write(&temporary, body)
            .map_err(|err| format!("no se pudo escribir {}: {err}", temporary.display()))?;
        std::fs::rename(&temporary, &self.path)
            .map_err(|err| format!("no se pudo reemplazar {}: {err}", self.path.display()))?;
        Ok(())
    }
}

/* -------------------------------------------------------------------------- */
/* Pruebas                                                                    */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    // Claves ed25519 reales, generadas con `ssh-keygen`: una clave inventada
    // falla al decodificar el blob y no probaría nada.
    const KEY_ONE: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGFazmdE8vvhQkaWIw3kLXWPNOnY+kFiE0duRAF2pYLE";
    const KEY_TWO: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG+dCDalWHQkWMB+fmtxJ5mlbwNR2GJATBvOwvej9QyO";
    /// Huella que debe producir `KEY_ONE`, comprobada con `ssh-keygen -lf`.
    const KEY_ONE_FINGERPRINT: &str = "SHA256:PLPIiOeWzKJfwYCxVhLvp7GRDqBEQ+3F7nDlL+97uKs";

    /// Una clave de **otro tipo**, también real, para comprobar que ed25519 y
    /// ECDSA del mismo host conviven sin pisarse.
    const KEY_ECDSA: &str =
        "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBKbbDQ5Hx8XLkR5QgVIfYossdZd189uE8Z00AR+Kgm9doYkUyYnidSL0+Ll0u1C7urVeSpA4F7mS+gnNEtvRJzg=";

    fn key(openssh: &str) -> PublicKey {
        PublicKey::from_openssh(openssh).expect("clave de prueba válida")
    }

    fn temp_store(name: &str) -> KnownHosts {
        let path = std::env::temp_dir().join(format!("cloudterm-test-{name}-known_hosts"));
        let _ = std::fs::remove_file(&path);
        KnownHosts::new(path)
    }

    #[test]
    fn test_parse_openssh_format() {
        let entry = parse_line(&format!("[servidor.example.com]:2222 {KEY_ONE}"))
            .expect("debería interpretar la línea");
        assert_eq!(entry.host, "servidor.example.com");
        assert_eq!(entry.port, 2222);
        assert_eq!(entry.key_type, "ssh-ed25519");
        assert!(entry.key.starts_with("AAAAC3NzaC1lZDI1"));
    }

    #[test]
    fn test_parse_no_port() {
        let entry = parse_line(&format!("otro.example.com {KEY_TWO}")).expect("línea válida");
        assert_eq!(entry.host, "otro.example.com");
        assert_eq!(entry.port, DEFAULT_PORT, "sin puerto se asume el 22");
    }

    #[test]
    fn test_parse_ignores_comments_and_hashed_entries() {
        assert!(parse_line("# un comentario").is_none());
        assert!(parse_line("").is_none());
        assert!(parse_line("   ").is_none());
        // Las entradas con hash no se pueden casar por nombre: se ignoran.
        assert!(parse_line("|1|abcdef=|ghijkl= ssh-ed25519 AAAA").is_none());
    }

    #[test]
    fn test_host_key_round_trip() {
        assert_eq!(host_key("a.com", 22), "a.com");
        assert_eq!(host_key("a.com", 2222), "[a.com]:2222");
        assert_eq!(split_host_key("a.com"), ("a.com".to_string(), 22));
        assert_eq!(split_host_key("[a.com]:2222"), ("a.com".to_string(), 2222));
        // Una entrada sin corchetes se interpreta como puerto por defecto.
        assert_eq!(split_host_key("a.com"), ("a.com".to_string(), 22));
    }

    #[test]
    fn test_fingerprint_sha256() {
        // Se contrasta con la huella que da `ssh-keygen -lf`, no con una
        // longitud calculada a mano: así el formato queda verificado de verdad.
        assert_eq!(fingerprint(&key(KEY_ONE)), KEY_ONE_FINGERPRINT);
        assert!(KEY_ONE_FINGERPRINT.starts_with("SHA256:"));
    }

    #[test]
    fn test_check_new_host() {
        let store = temp_store("new");
        let status = store
            .check("nuevo.example.com", 22, &key(KEY_ONE))
            .expect("comprobación");
        assert_eq!(status, HostKeyStatus::New);
    }

    #[test]
    fn test_check_match() {
        let store = temp_store("match");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("añadir");

        let status = store
            .check("host.example.com", 22, &key(KEY_ONE))
            .expect("comprobación");
        assert_eq!(status, HostKeyStatus::Match);
    }

    /// Un servidor ofrece varios algoritmos a la vez: cada uno es una entrada
    /// propia y ninguna debe borrar a las demás.
    #[test]
    fn keeps_one_entry_per_key_type() {
        let store = temp_store("varios-tipos");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("ed25519");
        store.add("host.example.com", 22, &key(KEY_ECDSA)).expect("ecdsa");

        let entries = store.entries().expect("leer");
        assert_eq!(entries.len(), 2, "deberían convivir los dos tipos");

        // Y sobreviven a releer el fichero desde disco.
        let tipos: Vec<String> = store
            .list()
            .expect("listar")
            .into_iter()
            .map(|e| e.key_type)
            .collect();
        assert!(tipos.contains(&"ssh-ed25519".to_string()), "{tipos:?}");
        assert!(tipos.contains(&"ecdsa-sha2-nistp256".to_string()), "{tipos:?}");
    }

    /// Que el servidor negocie un algoritmo todavía no guardado es una primera
    /// vez, no un cambio de clave. Antes se reportaba como `Mismatch` y la
    /// conexión se rechazaba sola.
    #[test]
    fn another_key_type_is_not_a_mismatch() {
        let store = temp_store("otro-tipo");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("ed25519");

        let status = store
            .check("host.example.com", 22, &key(KEY_ECDSA))
            .expect("comprobación");
        assert_eq!(status, HostKeyStatus::New);
    }

    /// Dentro del mismo tipo, una clave distinta sí es un cambio y debe
    /// detectarse.
    #[test]
    fn same_type_different_key_is_a_mismatch() {
        let store = temp_store("mismo-tipo");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("añadir");

        let status = store
            .check("host.example.com", 22, &key(KEY_TWO))
            .expect("comprobación");

        match status {
            HostKeyStatus::Mismatch { old_fingerprint } => {
                assert_eq!(old_fingerprint, KEY_ONE_FINGERPRINT);
            }
            other => panic!("se esperaba Mismatch, llegó {other:?}"),
        }
    }

    /// Borrar un host debe llevarse todas sus claves, no solo una.
    #[test]
    fn remove_drops_every_key_type() {
        let store = temp_store("borrar-todos");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("ed25519");
        store.add("host.example.com", 22, &key(KEY_ECDSA)).expect("ecdsa");

        assert!(store.remove("host.example.com", 22).expect("borrar"));
        assert!(store.entries().expect("leer").is_empty());
        assert!(!store.remove("host.example.com", 22).expect("borrar otra vez"));
    }

    #[test]
    fn test_check_match_with_custom_port() {
        let store = temp_store("match-port");
        store.add("host.example.com", 2222, &key(KEY_ONE)).expect("añadir");

        assert_eq!(
            store.check("host.example.com", 2222, &key(KEY_ONE)).unwrap(),
            HostKeyStatus::Match
        );
        // El mismo host en otro puerto es otro destino.
        assert_eq!(
            store.check("host.example.com", 22, &key(KEY_ONE)).unwrap(),
            HostKeyStatus::New
        );
    }

    #[test]
    fn test_check_mismatch() {
        let store = temp_store("mismatch");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("añadir");

        let status = store
            .check("host.example.com", 22, &key(KEY_TWO))
            .expect("comprobación");

        match status {
            HostKeyStatus::Mismatch { old_fingerprint } => {
                assert_eq!(old_fingerprint, fingerprint(&key(KEY_ONE)));
            }
            other => panic!("se esperaba Mismatch, llegó {other:?}"),
        }
    }

    #[test]
    fn test_add_and_remove() {
        let store = temp_store("add-remove");
        store.add("uno.example.com", 22, &key(KEY_ONE)).expect("añadir 1");
        store.add("dos.example.com", 2222, &key(KEY_TWO)).expect("añadir 2");

        let list = store.list().expect("listar");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].host, "dos.example.com", "orden por host");
        assert_eq!(list[0].port, 2222);
        assert!(!list[0].fingerprint.is_empty());

        assert!(store.remove("uno.example.com", 22).expect("borrar"));
        assert_eq!(store.list().expect("listar").len(), 1);

        // Borrar algo que no está no es un error, pero informa de que no estaba.
        assert!(!store.remove("uno.example.com", 22).expect("borrar otra vez"));
    }

    #[test]
    fn test_add_replaces_existing_entry() {
        let store = temp_store("replace");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("primera");
        store.add("host.example.com", 22, &key(KEY_TWO)).expect("reemplazo");

        let list = store.list().expect("listar");
        assert_eq!(list.len(), 1, "no debe duplicar el host");
        assert_eq!(list[0].key_type, "ssh-ed25519");
        assert_eq!(
            store.check("host.example.com", 22, &key(KEY_TWO)).unwrap(),
            HostKeyStatus::Match
        );
    }

    #[test]
    fn test_file_format_is_openssh_compatible() {
        let store = temp_store("format");
        store.add("host.example.com", 22, &key(KEY_ONE)).expect("añadir");
        store.add("host.example.com", 2222, &key(KEY_TWO)).expect("añadir");

        let raw = std::fs::read_to_string(store.path()).expect("leer el fichero");
        assert!(
            raw.lines().any(|l| l.starts_with("host.example.com ssh-ed25519 ")),
            "falta la línea sin puerto:\n{raw}"
        );
        assert!(
            raw.lines().any(|l| l.starts_with("[host.example.com]:2222 ssh-ed25519 ")),
            "falta la línea con puerto:\n{raw}"
        );
    }
}
