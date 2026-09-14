// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Sesiones SSH: gestor, comandos de Tauri y eventos hacia el frontend.
//!
//! El transporte vive en el submódulo [`client`]; aquí está el contrato con la
//! interfaz:
//!
//! | Comando | Efecto |
//! | --- | --- |
//! | `ssh_connect` | conecta, autentica y abre la shell |
//! | `ssh_write` | envía datos del teclado al canal |
//! | `ssh_resize` | informa al servidor del nuevo tamaño del PTY |
//! | `ssh_disconnect` | cierra la sesión |
//! | `ssh_sessions` | lista los identificadores activos |
//!
//! Eventos emitidos: `ssh://data` (bytes de salida) y `ssh://status`
//! (`connecting` · `connected` · `closed` · `error`).

pub(crate) mod client;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use russh::client::Handle;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::sync::mpsc;

pub use client::ClientHandler;

pub mod known_hosts;

/* -------------------------------------------------------------------------- */
/* Estados                                                                    */
/* -------------------------------------------------------------------------- */

pub const STATUS_CONNECTING: &str = "connecting";
pub const STATUS_CONNECTED: &str = "connected";
pub const STATUS_CLOSED: &str = "closed";
pub const STATUS_ERROR: &str = "error";

/* -------------------------------------------------------------------------- */
/* Tipos compartidos con el frontend                                          */
/* -------------------------------------------------------------------------- */

/// Método de autenticación elegido por el usuario.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SshAuth {
    /// Contraseña en claro. Viaja por el IPC local de Tauri, nunca por la red
    /// sin cifrar (SSH la negocia dentro del túnel).
    Password { password: String },
    /// Clave privada. Si `key_path` es `None`, se autodetecta en `~/.ssh`.
    Key {
        #[serde(default)]
        key_path: Option<String>,
        #[serde(default)]
        passphrase: Option<String>,
    },
}

fn default_term() -> String {
    "xterm-256color".to_string()
}

fn default_cols() -> u32 {
    80
}

fn default_rows() -> u32 {
    24
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectRequest {
    /// Identificador de la pestaña que posee la sesión.
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    #[serde(default = "default_term")]
    pub term: String,
    #[serde(default = "default_cols")]
    pub cols: u32,
    #[serde(default = "default_rows")]
    pub rows: u32,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshSessionInfo {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPayload {
    pub session_id: String,
    /// Bytes crudos: el frontend los convierte a `Uint8Array` y xterm.js
    /// decodifica UTF-8 respetando los caracteres multibyte partidos entre
    /// fragmentos.
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPayload {
    pub session_id: String,
    pub status: String,
    pub message: Option<String>,
}

/* -------------------------------------------------------------------------- */
/* Verificación de claves de servidor                                         */
/* -------------------------------------------------------------------------- */

/// Decisión del usuario sobre una clave desconocida o cambiada.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyDecision {
    pub accept: bool,
    /// Guardar en `known_hosts` para no volver a preguntar.
    pub remember: bool,
}

/// Lo que se envía al frontend cuando hay que decidir sobre una clave.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyPrompt {
    pub request_id: String,
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
    /// Huella anterior; solo en los cambios de clave.
    pub old_fingerprint: Option<String>,
}

/// Decisiones pendientes, indexadas por identificador de petición.
///
/// El handshake SSH se queda esperando aquí a que el usuario conteste. Sin esa
/// espera habría que aceptar la clave *antes* de preguntar, que es justo lo que
/// hay que evitar.
pub type PendingDecisions =
    Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<HostKeyDecision>>>>;

/// Estado que Tauri inyecta con `manage`.
#[derive(Default)]
pub struct HostKeyPrompts(pub PendingDecisions);

/* -------------------------------------------------------------------------- */
/* Gestor de sesiones                                                         */
/* -------------------------------------------------------------------------- */

/// Órdenes que la interfaz envía a la tarea de escritura de una sesión.
pub enum SessionCommand {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Eof,
    Close,
}

struct SessionEntry {
    tx: mpsc::UnboundedSender<SessionCommand>,
    /// Conservar el `Handle` mantiene viva la conexión: al soltarlo, russh cierra.
    handle: Handle<ClientHandler>,
}

/// Estado que Tauri inyecta con `manage`.
#[derive(Default)]
pub struct SshManager {
    sessions: Mutex<HashMap<String, SessionEntry>>,
}

fn take_session(manager: &SshManager, session_id: &str) -> Option<SessionEntry> {
    manager.sessions.lock().ok()?.remove(session_id)
}

/* -------------------------------------------------------------------------- */
/* Utilidades internas                                                        */
/* -------------------------------------------------------------------------- */

pub(crate) fn emit_status(app: &AppHandle, session_id: &str, status: &str, message: Option<String>) {
    let _ = app.emit(
        "ssh://status",
        StatusPayload {
            session_id: session_id.to_string(),
            status: status.to_string(),
            message,
        },
    );
}

/// Retira una sesión del gestor cuando su canal se cierra por su cuenta.
pub(crate) fn forget_session(app: &AppHandle, session_id: &str) {
    if let Some(manager) = app.try_state::<SshManager>() {
        let _ = take_session(&manager, session_id);
    }
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

/// Abre una sesión SSH y deja la shell lista para usar.
#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, SshManager>,
    request: SshConnectRequest,
) -> Result<SshSessionInfo, String> {
    let session_id = request.session_id.clone();
    let host = request.host.clone();
    let port = request.port;
    let username = request.username.clone();

    // Si ya había una sesión con este id (recarga de pestaña), se cierra antes.
    if let Some(previous) = take_session(&state, &session_id) {
        let _ = previous.tx.send(SessionCommand::Close);
        client::close(previous.handle).await;
    }

    emit_status(&app, &session_id, STATUS_CONNECTING, None);

    let (tx, rx) = mpsc::unbounded_channel::<SessionCommand>();

    let handle = match client::open_session(app.clone(), request, rx).await {
        Ok(handle) => handle,
        Err(err) => {
            emit_status(&app, &session_id, STATUS_ERROR, Some(err.clone()));
            return Err(err);
        }
    };

    {
        let mut guard = state
            .sessions
            .lock()
            .map_err(|_| "gestor de sesiones bloqueado".to_string())?;
        guard.insert(session_id.clone(), SessionEntry { tx, handle });
    }

    Ok(SshSessionInfo {
        session_id,
        host,
        port,
        username,
        message: "sesión establecida".to_string(),
    })
}

/// Envía datos del teclado al canal de la sesión.
#[tauri::command]
pub fn ssh_write(
    state: State<'_, SshManager>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let guard = state
        .sessions
        .lock()
        .map_err(|_| "gestor de sesiones bloqueado".to_string())?;
    let entry = guard
        .get(&session_id)
        .ok_or_else(|| format!("no hay ninguna sesión activa con id {session_id}"))?;
    entry
        .tx
        .send(SessionCommand::Data(data))
        .map_err(|_| "la sesión se ha cerrado".to_string())
}

/// Comunica al servidor el nuevo tamaño del PTY.
#[tauri::command]
pub fn ssh_resize(
    state: State<'_, SshManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let guard = state
        .sessions
        .lock()
        .map_err(|_| "gestor de sesiones bloqueado".to_string())?;
    let entry = guard
        .get(&session_id)
        .ok_or_else(|| format!("no hay ninguna sesión activa con id {session_id}"))?;
    entry
        .tx
        .send(SessionCommand::Resize { cols, rows })
        .map_err(|_| "la sesión se ha cerrado".to_string())
}

/// Cierra una sesión y libera sus recursos.
#[tauri::command]
pub async fn ssh_disconnect(
    app: AppHandle,
    state: State<'_, SshManager>,
    session_id: String,
) -> Result<(), String> {
    if let Some(entry) = take_session(&state, &session_id) {
        let _ = entry.tx.send(SessionCommand::Close);
        client::close(entry.handle).await;
        emit_status(&app, &session_id, STATUS_CLOSED, None);
    }
    Ok(())
}

/// Identificadores de las sesiones abiertas ahora mismo.
#[tauri::command]
pub fn ssh_sessions(state: State<'_, SshManager>) -> Result<Vec<String>, String> {
    let guard = state
        .sessions
        .lock()
        .map_err(|_| "gestor de sesiones bloqueado".to_string())?;
    Ok(guard.keys().cloned().collect())
}

/* -------------------------------------------------------------------------- */
/* Sondeo de hosts (sin autenticar)                                           */
/* -------------------------------------------------------------------------- */

fn default_timeout() -> u64 {
    8_000
}

/// Resultado del sondeo de un host.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub host: String,
    pub port: u16,
    pub reachable: bool,
    pub latency_ms: u128,
    /// Cadena de identificación que anuncia el servidor (`SSH-2.0-OpenSSH_9.6`).
    pub banner: Option<String>,
    pub message: String,
}

/// Comprueba que un host acepta conexiones TCP y, si habla SSH, devuelve su banner.
#[tauri::command]
pub async fn probe_host(
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<ProbeResult, String> {
    if host.trim().is_empty() {
        return Err("el host no puede estar vacío".to_string());
    }
    if port == 0 {
        return Err("el puerto debe estar entre 1 y 65535".to_string());
    }

    let budget = Duration::from_millis(timeout_ms.unwrap_or_else(default_timeout));
    let address = format!("{host}:{port}");
    let started = Instant::now();

    let mut stream = match tokio::time::timeout(budget, TcpStream::connect(&address)).await {
        Ok(Ok(stream)) => stream,
        Ok(Err(err)) => {
            return Ok(ProbeResult {
                host,
                port,
                reachable: false,
                latency_ms: started.elapsed().as_millis(),
                banner: None,
                message: format!("conexión rechazada: {err}"),
            })
        }
        Err(_) => {
            return Ok(ProbeResult {
                host,
                port,
                reachable: false,
                latency_ms: started.elapsed().as_millis(),
                banner: None,
                message: format!("tiempo de espera agotado tras {} ms", budget.as_millis()),
            })
        }
    };

    // El servidor SSH habla primero: leemos su identificación.
    let mut buffer = [0u8; 128];
    let banner = match tokio::time::timeout(budget, stream.read(&mut buffer)).await {
        Ok(Ok(0)) => None,
        Ok(Ok(read)) => Some(String::from_utf8_lossy(&buffer[..read]).trim().to_string()),
        Ok(Err(_)) | Err(_) => None,
    };

    Ok(ProbeResult {
        host,
        port,
        reachable: true,
        latency_ms: started.elapsed().as_millis(),
        message: match &banner {
            Some(_) => "host accesible, servicio SSH detectado".to_string(),
            None => "host accesible (sin banner SSH inmediato)".to_string(),
        },
        banner,
    })
}

/// Ruta del fichero `known_hosts` propio de CloudTerm.
#[tauri::command]
pub fn known_hosts_path(app: AppHandle) -> Result<String, String> {
    Ok(known_hosts::KnownHosts::default_path(&app)?
        .to_string_lossy()
        .to_string())
}

/// Todas las claves de servidor guardadas.
#[tauri::command]
pub fn known_hosts_list(app: AppHandle) -> Result<Vec<known_hosts::KnownHostEntry>, String> {
    known_hosts::KnownHosts::from_app(&app)?.list()
}

/// Borra la clave guardada de un host. Devuelve `true` si existía.
#[tauri::command]
pub fn known_hosts_remove(app: AppHandle, host: String, port: u16) -> Result<bool, String> {
    known_hosts::KnownHosts::from_app(&app)?.remove(&host, port)
}

/// Vacía el fichero entero.
#[tauri::command]
pub fn known_hosts_clear(app: AppHandle) -> Result<(), String> {
    known_hosts::KnownHosts::from_app(&app)?.clear()
}

/// Guarda a mano la clave de un host, sin esperar a conectarse.
#[tauri::command]
pub fn known_hosts_add(
    app: AppHandle,
    host: String,
    port: u16,
    key: String,
) -> Result<known_hosts::KnownHostEntry, String> {
    let public = russh::keys::PublicKey::from_openssh(&key)
        .map_err(|err| format!("clave pública inválida: {err}"))?;
    known_hosts::KnownHosts::from_app(&app)?.add(&host, port, &public)
}

/// Respuesta del usuario a un aviso de clave de servidor.
///
/// Desbloquea el handshake SSH que está esperando.
#[tauri::command]
pub async fn known_hosts_decide(
    state: State<'_, HostKeyPrompts>,
    request_id: String,
    accept: bool,
    remember: bool,
) -> Result<bool, String> {
    let sender = state.0.lock().await.remove(&request_id);
    match sender {
        Some(sender) => sender
            .send(HostKeyDecision { accept, remember })
            .map_err(|_| "la conexión ya no espera esta decisión".to_string())
            .map(|()| true),
        // Llegar tarde no es un error: el handshake ya aplicó su política.
        None => Ok(false),
    }
}

/* -------------------------------------------------------------------------- */
/* Registro de conexiones                                                     */
/* -------------------------------------------------------------------------- */

/// Fichero donde se anotan los intentos de conexión.
const LOG_FILE: &str = "conexiones.log";

/// Por encima de este tamaño se recorta el registro.
const LOG_MAX_BYTES: u64 = 256 * 1024;

/// Ruta del registro de conexiones.
pub fn log_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    Some(dir.join(LOG_FILE))
}

/// Anota una línea con la hora local.
///
/// Un fallo al escribir no debe romper nada: el registro ayuda a diagnosticar,
/// no forma parte del funcionamiento. Por eso no devuelve error.
pub fn log_line(app: &AppHandle, message: &str) {
    let Some(path) = log_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // El registro no puede crecer sin freno: pasado el tope se conserva solo la
    // mitad más reciente.
    if std::fs::metadata(&path)
        .map(|m| m.len() > LOG_MAX_BYTES)
        .unwrap_or(false)
    {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            let lines: Vec<&str> = raw.lines().collect();
            let keep = lines.len() / 2;
            let _ = std::fs::write(&path, lines[keep..].join("\n") + "\n");
        }
    }

    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        use std::io::Write;
        let _ = writeln!(file, "[{stamp}] {message}");
    }
}

/// Ruta del registro, para poder enseñarla en la interfaz.
#[tauri::command]
pub fn ssh_log_path(app: AppHandle) -> Result<String, String> {
    log_path(&app)
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "no se pudo resolver el directorio de datos".to_string())
}

/// Contenido del registro de conexiones.
#[tauri::command]
pub fn ssh_log_read(app: AppHandle) -> Result<String, String> {
    let path =
        log_path(&app).ok_or_else(|| "no se pudo resolver el directorio de datos".to_string())?;
    Ok(std::fs::read_to_string(path).unwrap_or_default())
}

/// Vacía el registro de conexiones.
#[tauri::command]
pub fn ssh_log_clear(app: AppHandle) -> Result<(), String> {
    if let Some(path) = log_path(&app) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
