//! Navegación y transferencia de archivos.
//!
//! Cubre las tres piezas del panel dual:
//!
//! * **Remoto** sobre `russh-sftp`, con una conexión SSH propia por sesión.
//! * **Local** con `std::fs` / `tokio::fs`.
//! * **Progreso** de cada transferencia por el evento `sftp://progress`.
//!
//! La cola de transferencias vive en el frontend: aquí solo hay operaciones
//! atómicas de una en una, que es lo que hace fácil razonar sobre el progreso y
//! los errores.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use russh::client::Handle;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileType;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::ssh::client::{self, ClientHandler, SessionParams};
use crate::ssh::SshAuth;

pub mod cmd;
pub mod editor;

/// Tamaño de bloque de las transferencias.
const CHUNK: usize = 64 * 1024;
/// Cada cuántos bytes se emite un evento de progreso (evita saturar el IPC).
const PROGRESS_STEP: u64 = 256 * 1024;

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

/// Una entrada de directorio, local o remota.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// Marca de tiempo en milisegundos UNIX.
    pub modified: Option<i64>,
    /// Modo POSIX en octal (`"0644"`); `None` en sistemas sin permisos.
    pub permissions: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpConnectRequest {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpConnectInfo {
    pub session_id: String,
    pub home: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub transfer_id: String,
    pub transferred: u64,
    pub total: u64,
    pub done: bool,
}

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

struct SftpHandle {
    session: Arc<SftpSession>,
    /// Conserva la conexión SSH viva mientras exista la sesión SFTP.
    _handle: Handle<ClientHandler>,
}

/// Estado que Tauri inyecta con `manage`.
#[derive(Default)]
pub struct SftpManager {
    sessions: Mutex<HashMap<String, Arc<SftpHandle>>>,
}

async fn get_handle(state: &SftpManager, session_id: &str) -> Result<Arc<SftpHandle>, String> {
    let guard = state.sessions.lock().await;
    guard
        .get(session_id)
        .cloned()
        .ok_or_else(|| format!("no hay ninguna sesión SFTP con id {session_id}"))
}

fn emit_progress(app: &AppHandle, payload: ProgressPayload) {
    let _ = app.emit("sftp://progress", payload);
}

/* -------------------------------------------------------------------------- */
/* Utilidades de rutas y de listado                                           */
/* -------------------------------------------------------------------------- */

fn join_path(base: &str, name: &str) -> String {
    if base.is_empty() || base == "/" {
        format!("/{name}")
    } else if base.ends_with('/') {
        format!("{base}{name}")
    } else {
        format!("{base}/{name}")
    }
}

fn sort_entries(entries: &mut [FsEntry]) {
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> Option<i64> {
    time.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
}

#[cfg(unix)]
fn mode_string(meta: &std::fs::Metadata) -> Option<String> {
    use std::os::unix::fs::PermissionsExt;
    Some(format!("{:04o}", meta.permissions().mode() & 0o7777))
}

#[cfg(not(unix))]
fn mode_string(_meta: &std::fs::Metadata) -> Option<String> {
    None
}

/// Lista un directorio local. Los enlaces se resuelven para saber si apuntan a
/// un directorio, pero se siguen marcando como enlaces.
fn local_entries(path: &Path) -> Result<Vec<FsEntry>, String> {
    let reader =
        std::fs::read_dir(path).map_err(|err| format!("no se pudo leer {}: {err}", path.display()))?;

    let mut entries = Vec::new();
    for item in reader.flatten() {
        let entry_path = item.path();
        let Ok(link_meta) = std::fs::symlink_metadata(&entry_path) else {
            continue;
        };
        let is_symlink = link_meta.file_type().is_symlink();
        let resolved = if is_symlink {
            std::fs::metadata(&entry_path).ok()
        } else {
            None
        };
        let meta = resolved.as_ref().unwrap_or(&link_meta);

        entries.push(FsEntry {
            name: item.file_name().to_string_lossy().to_string(),
            path: entry_path.to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            is_symlink,
            size: if meta.is_dir() { 0 } else { meta.len() },
            modified: millis(meta.modified()),
            permissions: mode_string(meta),
        });
    }

    sort_entries(&mut entries);
    Ok(entries)
}

/// Lista un directorio remoto.
async fn remote_entries(session: &SftpSession, path: &str) -> Result<Vec<FsEntry>, String> {
    let dir = session
        .read_dir(path)
        .await
        .map_err(|err| format!("no se pudo leer {path}: {err}"))?;

    let mut entries = Vec::new();
    for entry in dir {
        let name = entry.file_name();
        let full = join_path(path, &name);
        let attributes = entry.metadata();
        let file_type = entry.file_type();

        let is_dir = matches!(file_type, FileType::Dir);
        let is_symlink = matches!(file_type, FileType::Symlink);

        // Algunos servidores no mandan los atributos en el paquete NAME; en ese
        // caso se pide un stat, solo para ficheros.
        let mut size = attributes.size.unwrap_or(0);
        if !is_dir && attributes.size.is_none() {
            if let Ok(meta) = session.metadata(&full).await {
                size = meta.size.unwrap_or(0);
            }
        }

        entries.push(FsEntry {
            name,
            path: full,
            is_dir,
            is_symlink,
            size,
            modified: attributes.mtime.map(|secs| secs as i64 * 1000),
            permissions: attributes
                .permissions
                .map(|mode| format!("{:04o}", mode & 0o7777)),
        });
    }

    sort_entries(&mut entries);
    Ok(entries)
}

/* -------------------------------------------------------------------------- */
/* Comandos: sistema local                                                    */
/* -------------------------------------------------------------------------- */

/// Directorio personal del usuario, punto de partida del panel local.
#[tauri::command]
pub fn local_home(app: AppHandle) -> Result<String, String> {
    app.path()
        .home_dir()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|err| format!("no se pudo resolver el directorio personal: {err}"))
}

#[tauri::command]
pub fn local_list(path: String) -> Result<Vec<FsEntry>, String> {
    local_entries(Path::new(&path))
}

#[tauri::command]
pub fn local_mkdir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|err| format!("no se pudo crear {path}: {err}"))
}

/* -------------------------------------------------------------------------- */
/* Comandos: sesión SFTP                                                      */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub async fn sftp_connect(
    app: AppHandle,
    state: State<'_, SftpManager>,
    request: SftpConnectRequest,
) -> Result<SftpConnectInfo, String> {
    let params = SessionParams {
        host: request.host.clone(),
        port: request.port,
        username: request.username.clone(),
        auth: request.auth.clone(),
        term: "xterm-256color".to_string(),
        cols: 80,
        rows: 24,
        timeout: std::time::Duration::from_millis(request.timeout_ms.unwrap_or(60_000)),
        home_dir: None,
        app: Some(app.clone()),
    };

    let (handle, session) = client::open_sftp(&params).await?;

    // `canonicalize(".")` es la forma portable de preguntar «¿dónde he aterrizado?».
    let home = session
        .canonicalize(".")
        .await
        .unwrap_or_else(|_| "/".to_string());

    let session_id = request.session_id.clone();
    state.sessions.lock().await.insert(
        session_id.clone(),
        Arc::new(SftpHandle {
            session: Arc::new(session),
            _handle: handle,
        }),
    );

    Ok(SftpConnectInfo {
        session_id,
        home,
        message: "subsistema SFTP listo".to_string(),
    })
}

#[tauri::command]
pub async fn sftp_disconnect(
    state: State<'_, SftpManager>,
    session_id: String,
) -> Result<(), String> {
    let removed = state.sessions.lock().await.remove(&session_id);
    if let Some(handle) = removed {
        let _ = handle.session.close().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_list(
    state: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<Vec<FsEntry>, String> {
    let handle = get_handle(&state, &session_id).await?;
    remote_entries(&handle.session, &path).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    let handle = get_handle(&state, &session_id).await?;
    handle
        .session
        .create_dir(&path)
        .await
        .map_err(|err| format!("no se pudo crear {path}: {err}"))
}

#[tauri::command]
pub async fn sftp_remove(
    state: State<'_, SftpManager>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let handle = get_handle(&state, &session_id).await?;
    let result = if is_dir {
        handle.session.remove_dir(&path).await
    } else {
        handle.session.remove_file(&path).await
    };
    result.map_err(|err| format!("no se pudo borrar {path}: {err}"))
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, SftpManager>,
    session_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let handle = get_handle(&state, &session_id).await?;
    handle
        .session
        .rename(&from, &to)
        .await
        .map_err(|err| format!("no se pudo renombrar {from}: {err}"))
}

/// Descarga un fichero remoto al disco local informando del progreso.
#[tauri::command]
pub async fn sftp_download(
    app: AppHandle,
    state: State<'_, SftpManager>,
    session_id: String,
    transfer_id: String,
    remote_path: String,
    local_path: String,
) -> Result<u64, String> {
    let handle = get_handle(&state, &session_id).await?;

    let total = handle
        .session
        .metadata(&remote_path)
        .await
        .ok()
        .and_then(|meta| meta.size)
        .unwrap_or(0);

    if let Some(parent) = Path::new(&local_path).parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|err| format!("no se pudo crear {}: {err}", parent.display()))?;
        }
    }

    let mut remote = handle
        .session
        .open(&remote_path)
        .await
        .map_err(|err| format!("no se pudo abrir {remote_path}: {err}"))?;
    let mut local = tokio::fs::File::create(&local_path)
        .await
        .map_err(|err| format!("no se pudo crear {local_path}: {err}"))?;

    let mut buffer = vec![0u8; CHUNK];
    let mut transferred = 0u64;
    let mut last_report = 0u64;

    loop {
        let read = remote
            .read(&mut buffer)
            .await
            .map_err(|err| format!("error leyendo {remote_path}: {err}"))?;
        if read == 0 {
            break;
        }
        local
            .write_all(&buffer[..read])
            .await
            .map_err(|err| format!("error escribiendo {local_path}: {err}"))?;
        transferred += read as u64;

        if transferred - last_report >= PROGRESS_STEP {
            last_report = transferred;
            emit_progress(
                &app,
                ProgressPayload {
                    transfer_id: transfer_id.clone(),
                    transferred,
                    total,
                    done: false,
                },
            );
        }
    }

    local
        .flush()
        .await
        .map_err(|err| format!("no se pudo volcar {local_path}: {err}"))?;
    let _ = remote.close().await;

    emit_progress(
        &app,
        ProgressPayload {
            transfer_id,
            transferred,
            total: total.max(transferred),
            done: true,
        },
    );
    Ok(transferred)
}

/// Sube un fichero local al servidor informando del progreso.
#[tauri::command]
pub async fn sftp_upload(
    app: AppHandle,
    state: State<'_, SftpManager>,
    session_id: String,
    transfer_id: String,
    local_path: String,
    remote_path: String,
) -> Result<u64, String> {
    let handle = get_handle(&state, &session_id).await?;

    let total = tokio::fs::metadata(&local_path)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);

    let mut local = tokio::fs::File::open(&local_path)
        .await
        .map_err(|err| format!("no se pudo abrir {local_path}: {err}"))?;
    // `create` (CREATE|TRUNCATE|WRITE) es obligatorio: `SftpSession::write`
    // abriría solo en modo WRITE y fallaría si el fichero no existiese.
    let mut remote = handle
        .session
        .create(&remote_path)
        .await
        .map_err(|err| format!("no se pudo crear {remote_path}: {err}"))?;

    let mut buffer = vec![0u8; CHUNK];
    let mut transferred = 0u64;
    let mut last_report = 0u64;

    loop {
        let read = local
            .read(&mut buffer)
            .await
            .map_err(|err| format!("error leyendo {local_path}: {err}"))?;
        if read == 0 {
            break;
        }
        remote
            .write_all(&buffer[..read])
            .await
            .map_err(|err| format!("error escribiendo {remote_path}: {err}"))?;
        transferred += read as u64;

        if transferred - last_report >= PROGRESS_STEP {
            last_report = transferred;
            emit_progress(
                &app,
                ProgressPayload {
                    transfer_id: transfer_id.clone(),
                    transferred,
                    total,
                    done: false,
                },
            );
        }
    }

    // `File::close` espera el acuse del servidor: sin esto se perderían datos.
    remote
        .close()
        .await
        .map_err(|err| format!("no se pudo cerrar {remote_path}: {err}"))?;

    emit_progress(
        &app,
        ProgressPayload {
            transfer_id,
            transferred,
            total: total.max(transferred),
            done: true,
        },
    );
    Ok(transferred)
}

/* -------------------------------------------------------------------------- */
/* Pruebas de integración contra un sshd local                                */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::client::{self, SessionParams};
    use std::path::PathBuf;
    use std::time::Duration;

    const TEST_HOST: &str = "127.0.0.1";
    const TEST_PORT: u16 = 2222;
    const REMOTE_NAME: &str = ".cloudterm-sftp-test.txt";

    fn test_dir() -> PathBuf {
        PathBuf::from("std::env::temp_dir().join("cloudterm-sshd-test")")
    }

    /// Si el sshd de pruebas no está levantado, la prueba se omite en vez de
    /// fallar: `cargo test` debe seguir siendo útil en cualquier máquina.
    fn server_ready() -> bool {
        std::net::TcpStream::connect((TEST_HOST, TEST_PORT)).is_ok()
            && test_dir().join("client_ed25519").exists()
    }

    fn params() -> SessionParams {
        SessionParams {
            host: TEST_HOST.to_string(),
            port: TEST_PORT,
            username: std::env::var("USER").unwrap_or_else(|_| "root".to_string()),
            auth: SshAuth::Key {
                key_path: Some(
                    test_dir()
                        .join("client_ed25519")
                        .to_string_lossy()
                        .into_owned(),
                ),
                passphrase: None,
            },
            term: "xterm-256color".to_string(),
            cols: 80,
            rows: 24,
            timeout: Duration::from_secs(10),
            home_dir: None,
            app: None,
        }
    }

    #[test]
    fn joins_and_walks_paths() {
        assert_eq!(join_path("/home/deploy", "logs"), "/home/deploy/logs");
        assert_eq!(join_path("/", "etc"), "/etc");
        assert_eq!(join_path("/home/", "logs"), "/home/logs");
        assert_eq!(join_path("", "etc"), "/etc");
    }

    #[test]
    fn sorts_directories_before_files() {
        let entry = |name: &str, is_dir: bool| FsEntry {
            name: name.to_string(),
            path: format!("/{name}"),
            is_dir,
            is_symlink: false,
            size: 0,
            modified: None,
            permissions: None,
        };
        let mut entries = vec![entry("zeta.txt", false), entry("Alfa", true), entry("beta", true)];
        sort_entries(&mut entries);
        let order: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(order, vec!["Alfa", "beta", "zeta.txt"]);
    }

    /// Recorrido completo real: conectar por SFTP, listar, subir, comprobar,
    /// descargar y verificar que el contenido vuelve intacto.
    #[tokio::test]
    async fn uploads_and_downloads_round_trip() {
        if !server_ready() {
            eprintln!("sshd de prueba no disponible en {TEST_HOST}:{TEST_PORT}; prueba omitida");
            return;
        }

        let (handle, session) = client::open_sftp(&params()).await.expect("sesión SFTP");
        let home = session.canonicalize(".").await.expect("directorio inicial");
        assert!(home.starts_with('/'), "el home remoto debería ser absoluto: {home}");

        // El listado no debe fallar aunque el directorio esté vacío.
        let initial = remote_entries(&session, &home).await.expect("listar el home");
        assert!(
            initial.iter().all(|e| !e.name.is_empty()),
            "no debería haber entradas sin nombre"
        );

        let payload = b"cloudterm sftp round trip\n".repeat(2000);
        let local_source = std::env::temp_dir().join("cloudterm-sftp-source.txt");
        let local_result = std::env::temp_dir().join("cloudterm-sftp-result.txt");
        tokio::fs::write(&local_source, &payload)
            .await
            .expect("fichero local de origen");

        let remote_file = join_path(&home, REMOTE_NAME);

        // --- subida ---------------------------------------------------------
        {
            let mut local = tokio::fs::File::open(&local_source).await.expect("abrir local");
            let mut remote = session.create(&remote_file).await.expect("crear remoto");
            tokio::io::copy(&mut local, &mut remote)
                .await
                .expect("copiar al servidor");
            remote.close().await.expect("cerrar remoto");
        }

        let after_upload = remote_entries(&session, &home).await.expect("listar tras subir");
        let uploaded = after_upload
            .iter()
            .find(|entry| entry.name == REMOTE_NAME)
            .expect("el fichero subido debe aparecer en el listado");
        assert_eq!(uploaded.size, payload.len() as u64, "tamaño remoto incorrecto");
        assert!(!uploaded.is_dir);

        // --- descarga -------------------------------------------------------
        {
            let mut remote = session.open(&remote_file).await.expect("abrir remoto");
            let mut local = tokio::fs::File::create(&local_result)
                .await
                .expect("crear local");
            tokio::io::copy(&mut remote, &mut local)
                .await
                .expect("copiar al disco");
            let _ = remote.close().await;
        }

        let round_tripped = tokio::fs::read(&local_result).await.expect("leer resultado");
        assert_eq!(round_tripped, payload, "el contenido descargado no coincide");

        // --- limpieza -------------------------------------------------------
        let _ = session.remove_file(&remote_file).await;
        let _ = session.close().await;
        let _ = tokio::fs::remove_file(&local_source).await;
        let _ = tokio::fs::remove_file(&local_result).await;
        drop(handle);
    }
}
