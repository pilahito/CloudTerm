// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Credenciales en el llavero del sistema operativo.
//!
//! * Linux   → Secret Service / kernel keyutils (`linux-native`)
//! * macOS   → Keychain
//! * Windows → Credential Manager
//!
//! Las contraseñas, passphrases y claves de API nunca tocan el disco en texto
//! plano.

const SERVICE: &str = "com.pilahito.cloudterm";

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|err| format!("llavero no disponible: {err}"))
}

/* -------------------------------------------------------------------------- */
/* Núcleo reutilizable (sin Tauri)                                            */
/* -------------------------------------------------------------------------- */

/// Guarda (o sobrescribe) un secreto.
pub fn set_secret(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|err| format!("no se pudo guardar el secreto «{key}»: {err}"))
}

/// Recupera un secreto. Devuelve `None` si no existe.
pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("no se pudo leer el secreto «{key}»: {err}")),
    }
}

/// Borra un secreto. Es idempotente: borrar algo inexistente no es un error.
pub fn delete_secret(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("no se pudo borrar el secreto «{key}»: {err}")),
    }
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
