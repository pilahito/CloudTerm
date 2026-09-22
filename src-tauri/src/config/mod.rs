// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Ajustes persistentes de CloudTerm + acceso al llavero del sistema.
//!
//! Los ajustes se guardan como JSON en el directorio de configuración que
//! resuelve Tauri (`~/.config/com.pilahito.cloudterm/` en Linux). Las
//! credenciales **nunca** se guardan ahí: van al llavero del sistema
//! operativo a través del crate `keyring`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub mod secrets;

// Nota: los comandos de `secrets` se registran como `config::secrets::*` en
// `lib.rs`. Un `pub use` aquí no basta porque `#[tauri::command]` genera items
// auxiliares (`__cmd__*`) que no se re-exportan.

/// Preferencias de la aplicación. Los nombres viajan en camelCase para que el
/// frontend TypeScript pueda consumirlos directamente.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub theme: String,
    pub font_size: u16,
    pub font_family: String,
    pub cursor_blink: bool,
    pub scrollback: u32,
    pub confirm_on_close: bool,
    pub copy_on_select: bool,
    pub ai_enabled: bool,
    pub ai_model: String,
    pub ai_endpoint: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "midnight".to_string(),
            font_size: 14,
            font_family: "\"JetBrains Mono\", \"Fira Code\", Menlo, Consolas, monospace".to_string(),
            cursor_blink: true,
            scrollback: 5_000,
            confirm_on_close: true,
            copy_on_select: false,
            ai_enabled: false,
            ai_model: "deepseek-chat".to_string(),
            ai_endpoint: "https://api.deepseek.com/v1".to_string(),
        }
    }
}

/// Identificador de la aplicación, tal y como aparece en `tauri.conf.json`.
pub const IDENTIFICADOR: &str = "com.pilahito.cloudterm";

/// Directorio privado de datos de la aplicación, creándolo si hace falta.
///
/// Es el **único** sitio del programa que resuelve esta ruta: así los ajustes,
/// el fichero de secretos de Android y la base de datos no pueden acabar en
/// sitios distintos.
///
/// ## Por qué no vale `app_config_dir()` a secas en Android
///
/// En escritorio, `app_config_dir()` ya añade el identificador
/// (`~/.config/com.pilahito.cloudterm`). En Android, Tauri resuelve la ruta
/// llamando al plugin `PathPlugin`, que devuelve `activity.dataDir` **sin** el
/// identificador (`/data/user/0/com.pilahito.cloudterm`, que ya es privado de
/// la aplicación). Por eso se añade el identificador solo cuando falta.
///
/// Esto es lo que evita el fallo anterior: resolver la ruta leyendo variables
/// de entorno (`ANDROID_DATA`) daba `/data/com.pilahito.cloudterm`, un
/// directorio del sistema donde la aplicación **no puede escribir**.
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?;

    let dir = if base.ends_with(IDENTIFICADOR) {
        base
    } else {
        base.join(IDENTIFICADOR)
    };

    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
    Ok(dir)
}

/// Ruta del fichero de configuración, creando el directorio si hace falta.
pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("cloudterm.json"))
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|err| format!("no se pudo leer {}: {err}", path.display()))?;
    serde_json::from_str(&raw).map_err(|err| format!("configuración inválida: {err}"))
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let raw = serde_json::to_string_pretty(&config)
        .map_err(|err| format!("no se pudo serializar la configuración: {err}"))?;
    std::fs::write(&path, raw).map_err(|err| format!("no se pudo escribir {}: {err}", path.display()))
}
