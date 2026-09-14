// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! CloudTerm — backend Tauri.
//!
//! Mapa de módulos:
//!
//! * [`config`] — ajustes persistentes de la app y secretos en el llavero del SO.
//! * [`db`]     — almacén local (JSON sobre disco) para conexiones e historial.
//! * [`ssh`]    — sesiones SSH y sondeo de hosts (transporte `russh` + `tokio`).
//! * [`sftp`]   — navegación y transferencia de archivos (`russh-sftp`, `suppaftp`).

pub mod config;
pub mod db;
pub mod sftp;
pub mod ssh;
pub mod ai;
pub mod actualizacion;
pub mod idiomas;
pub mod auth;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub identifier: &'static str,
    pub license: &'static str,
    pub contact: &'static str,
}

/// Metadatos de la aplicación para la pantalla «Acerca de».
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "CloudTerm",
        version: env!("CARGO_PKG_VERSION"),
        identifier: "com.pilahito.cloudterm",
        license: "AGPL-3.0-or-later",
        contact: "57416155+pilahito@users.noreply.github.com",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .manage(db::DbState::default())
        .manage(ssh::SshManager::default())
        .manage(ssh::HostKeyPrompts::default())
        .manage(ai::AiManager::default())
        .manage(sftp::SftpManager::default())
        .manage(sftp::editor::EditManager::default())
        .manage(auth::AuthManager::default())
        .manage(auth::local::SeguridadState::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            config::load_config,
            config::save_config,
            // Los comandos del llavero se referencian por su ruta completa:
            // `#[tauri::command]` genera items ocultos (`__cmd__*`) que no
            // viajan a través de un `pub use`.
            config::secrets::secrets_set,
            config::secrets::secrets_get,
            config::secrets::secrets_delete,
            db::db_get,
            db::db_set,
            db::db_keys,
            db::db_location,
            db::hosts_list,
            db::hosts_create,
            db::hosts_update,
            db::hosts_delete,
            db::hosts_touch,
            db::hosts_import,
            db::ssh_config::ssh_config_preview,
            ssh::probe_host,
            ssh::known_hosts_path,
            ssh::known_hosts_list,
            ssh::known_hosts_add,
            ssh::known_hosts_remove,
            ssh::known_hosts_clear,
            ssh::known_hosts_decide,
            ssh::ssh_log_path,
            ssh::ssh_log_read,
            ssh::ssh_log_clear,
            ssh::ssh_connect,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            ssh::ssh_sessions,
            sftp::sftp_connect,
            sftp::sftp_disconnect,
            sftp::sftp_list,
            sftp::sftp_mkdir,
            sftp::sftp_remove,
            sftp::sftp_rename,
            sftp::sftp_upload,
            sftp::sftp_download,
            sftp::local_home,
            sftp::local_list,
            sftp::local_mkdir,
            sftp::editor::editores_disponibles,
            sftp::editor::abrir_con,
            sftp::editor::editar_remoto,
            sftp::editor::editar_listar,
            sftp::editor::editar_subir,
            sftp::editor::editar_terminar,
            sftp::editor::editar_cerrar_todas,
            sftp::editor::editar_carpeta,
            sftp::cmd::sftp_exec,
            sftp::cmd::local_exec,
            sftp::cmd::exec_linea,
            ai::ai_config_get,
            ai::ai_config_set,
            ai::ai_set_api_key,
            ai::ai_has_api_key,
            ai::ai_models,
            ai::ai_test_provider,
            ai::ai_chat,
            ai::ai_cancel,
            ai::ai_active,
            auth::auth_state,
            auth::auth_config_set,
            auth::auth_sign_in_google,
            auth::auth_sign_in_github,
            auth::auth_sign_out,
            auth::auth_sync_push,
            auth::auth_sync_pull,
            auth::local::auth_seguridad_estado,
            auth::local::auth_alta_empezar,
            auth::local::auth_alta_confirmar,
            auth::local::auth_desbloquear,
            auth::local::auth_seguridad_quitar,
            auth::local::auth_pide_segundo_factor,
            auth::destinos::destinos_estado,
            auth::destinos::destinos_guardar,
            auth::destinos::destinos_probar,
            auth::destinos::destinos_carpeta_sugerida,
            auth::destinos::destinos_abrir,
            actualizacion::comprobar_actualizacion,
            actualizacion::repositorio,
            idiomas::idiomas_externos,
            idiomas::idiomas_carpeta,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
