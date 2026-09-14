// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Credenciales en el llavero del sistema operativo.
//!
//! * Linux   → Secret Service / kernel keyutils (`linux-native`)
//! * macOS   → Keychain
//! * Windows → Credential Manager
//! * Android → un fichero con permisos `0600` (ver abajo)
//!
//! Las contraseñas, passphrases y claves de API nunca tocan el disco en texto
//! plano… salvo en Android, donde **sí**, y conviene saberlo.
//!
//! ## Por qué Android va aparte
//!
//! El crate del llavero no tiene implementación para Android: no existe un
//! `android.rs` y la opción `linux-native` arrastraría el llavero del kernel de
//! Linux, que ahí no está. Así que en esa plataforma los secretos van a un
//! fichero con permisos del dueño dentro del directorio privado de la
//! aplicación.
//!
//! **No es equivalente**: en escritorio el llavero puede estar cifrado por el
//! sistema y protegido por la sesión; un fichero `0600` solo lo protege de otros
//! usuarios del dispositivo. Queda pendiente usar el almacén de claves de
//! Android, que es lo correcto.

#[cfg(not(target_os = "android"))]
const SERVICE: &str = "com.pilahito.cloudterm";

#[cfg(not(target_os = "android"))]
fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|err| format!("llavero no disponible: {err}"))
}

/* -------------------------------------------------------------------------- */
/* Android: almacén de fichero                                                */
/* -------------------------------------------------------------------------- */

#[cfg(target_os = "android")]
mod android {
    use std::collections::BTreeMap;
    use std::path::PathBuf;

    /// Fichero donde se guardan los secretos.
    fn ruta() -> Result<PathBuf, String> {
        // Android no define `HOME`; el directorio privado de la aplicación sí
        // llega por entorno cuando Tauri la arranca.
        let base = std::env::var("XDG_DATA_HOME")
            .or_else(|_| std::env::var("HOME"))
            .or_else(|_| std::env::var("ANDROID_DATA"))
            .map_err(|_| "no se pudo resolver el directorio de datos".to_string())?;

        let dir = PathBuf::from(base).join("com.pilahito.cloudterm");
        std::fs::create_dir_all(&dir)
            .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
        Ok(dir.join("secretos.json"))
    }

    fn leer() -> BTreeMap<String, String> {
        ruta()
            .ok()
            .and_then(|r| std::fs::read_to_string(r).ok())
            .and_then(|bruto| serde_json::from_str(&bruto).ok())
            .unwrap_or_default()
    }

    fn escribir(datos: &BTreeMap<String, String>) -> Result<(), String> {
        let destino = ruta()?;
        let cuerpo = serde_json::to_string(datos)
            .map_err(|err| format!("no se pudieron serializar los secretos: {err}"))?;

        let temporal = destino.with_extension("tmp");
        std::fs::write(&temporal, cuerpo)
            .map_err(|err| format!("no se pudo escribir {}: {err}", temporal.display()))?;

        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporal, std::fs::Permissions::from_mode(0o600));

        std::fs::rename(&temporal, &destino)
            .map_err(|err| format!("no se pudo reemplazar {}: {err}", destino.display()))
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        let mut datos = leer();
        datos.insert(key.to_string(), value.to_string());
        escribir(&datos)
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        Ok(leer().get(key).cloned())
    }

    pub fn delete(key: &str) -> Result<(), String> {
        let mut datos = leer();
        if datos.remove(key).is_some() {
            escribir(&datos)?;
        }
        Ok(())
    }
}

/* -------------------------------------------------------------------------- */
/* Núcleo reutilizable (sin Tauri)                                            */
/* -------------------------------------------------------------------------- */

/// Guarda (o sobrescribe) un secreto.
#[cfg(not(target_os = "android"))]
pub fn set_secret(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|err| format!("no se pudo guardar el secreto «{key}»: {err}"))
}

/// Recupera un secreto. Devuelve `None` si no existe.
#[cfg(not(target_os = "android"))]
pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("no se pudo leer el secreto «{key}»: {err}")),
    }
}

/// Borra un secreto. Es idempotente: borrar algo inexistente no es un error.
#[cfg(not(target_os = "android"))]
pub fn delete_secret(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("no se pudo borrar el secreto «{key}»: {err}")),
    }
}

/// Guarda un secreto en Android (fichero con permisos del dueño).
#[cfg(target_os = "android")]
pub fn set_secret(key: &str, value: &str) -> Result<(), String> {
    android::set(key, value)
}

/// Recupera un secreto en Android.
#[cfg(target_os = "android")]
pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    android::get(key)
}

/// Borra un secreto en Android.
#[cfg(target_os = "android")]
pub fn delete_secret(key: &str) -> Result<(), String> {
    android::delete(key)
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn secrets_set(key: String, value: String) -> Result<(), String> {
    set_secret(&key, &value)
}

#[tauri::command]
pub fn secrets_get(key: String) -> Result<Option<String>, String> {
    get_secret(&key)
}

#[tauri::command]
pub fn secrets_delete(key: String) -> Result<(), String> {
    delete_secret(&key)
}
