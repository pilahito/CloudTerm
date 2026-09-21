// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Terminal local: un intérprete de verdad, no un juguete.
//!
//! En Unix se abre un PTY (`portable-pty`). En Windows se lanza PowerShell (o
//! `cmd`) con la entrada y la salida enchufadas al xterm: ConPTY arrastra DLLs
//! que en este proyecto impiden siquiera arrancar las pruebas.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOpenRequest {
    pub session_id: String,
    #[serde(default = "default_cols")]
    pub cols: u32,
    #[serde(default = "default_rows")]
    pub rows: u32,
    #[serde(default)]
    pub cwd: Option<String>,
}

fn default_cols() -> u32 {
    80
}

fn default_rows() -> u32 {
    24
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataPayload {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusPayload {
    session_id: String,
    status: String,
    message: Option<String>,
}

/// Programa que se lanza como intérprete local.
pub fn local_shell_program() -> String {
    #[cfg(windows)]
    {
        for name in ["pwsh.exe", "powershell.exe", "cmd.exe"] {
            if command_on_path(name) {
                return name.to_string();
            }
        }
        "cmd.exe".to_string()
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

#[cfg(windows)]
fn command_on_path(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|dir| dir.join(program).is_file())
}

#[cfg(all(unix, not(target_os = "android")))]
mod imp {
    use super::*;
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use tauri::Emitter;

    struct PtySession {
        writer: Mutex<Box<dyn Write + Send>>,
        master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
        killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
        alive: Arc<AtomicBool>,
    }

    #[derive(Default)]
    pub struct PtyManager {
        sessions: Mutex<HashMap<String, Arc<PtySession>>>,
    }

    fn take_session(state: &PtyManager, session_id: &str) -> Option<Arc<PtySession>> {
        state.sessions.lock().ok()?.remove(session_id)
    }

    fn kill_session(session: &PtySession) {
        session.alive.store(false, Ordering::Relaxed);
        if let Ok(mut killer) = session.killer.lock() {
            let _ = killer.kill();
        }
    }

    fn emit_status(app: &AppHandle, session_id: &str, status: &str, message: Option<String>) {
        let _ = app.emit(
            "pty://status",
            StatusPayload {
                session_id: session_id.to_string(),
                status: status.to_string(),
                message,
            },
        );
    }

    fn emit_data(app: &AppHandle, session_id: &str, data: Vec<u8>) {
        let _ = app.emit(
            "pty://data",
            DataPayload {
                session_id: session_id.to_string(),
                data,
            },
        );
    }

    fn size_of(cols: u32, rows: u32) -> PtySize {
        PtySize {
            rows: rows.clamp(2, 512) as u16,
            cols: cols.clamp(2, 512) as u16,
            pixel_width: 0,
            pixel_height: 0,
        }
    }

    fn shell_command(cwd: Option<String>) -> CommandBuilder {
        let mut cmd = CommandBuilder::new(local_shell_program());
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(dir) = cwd.filter(|value| !value.is_empty()) {
            cmd.cwd(dir);
        } else if let Some(home) = crate::ssh::client::home_from_env() {
            cmd.cwd(home);
        }
        cmd
    }

    pub fn open(
        app: AppHandle,
        state: State<'_, PtyManager>,
        request: PtyOpenRequest,
    ) -> Result<(), String> {
        if let Some(previous) = take_session(&state, &request.session_id) {
            kill_session(&previous);
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(size_of(request.cols, request.rows))
            .map_err(|err| format!("no se pudo abrir el terminal local: {err}"))?;

        let mut child = pair
            .slave
            .spawn_command(shell_command(request.cwd))
            .map_err(|err| {
                format!(
                    "no se pudo lanzar {program}: {err}",
                    program = local_shell_program()
                )
            })?;

        let killer = child.clone_killer();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|err| format!("no se pudo leer el terminal local: {err}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|err| format!("no se pudo escribir en el terminal local: {err}"))?;

        let alive = Arc::new(AtomicBool::new(true));
        let session = Arc::new(PtySession {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            killer: Mutex::new(killer),
            alive: alive.clone(),
        });

        {
            let mut guard = state
                .sessions
                .lock()
                .map_err(|_| "gestor de terminales locales bloqueado".to_string())?;
            guard.insert(request.session_id.clone(), session);
        }

        let app_read = app.clone();
        let session_id = request.session_id.clone();
        thread::Builder::new()
            .name(format!("pty-read-{session_id}"))
            .spawn(move || {
                let mut buf = [0u8; 8192];
                loop {
                    if !alive.load(Ordering::Relaxed) {
                        break;
                    }
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => emit_data(&app_read, &session_id, buf[..n].to_vec()),
                        Err(_) => break,
                    }
                }
                emit_status(&app_read, &session_id, "closed", None);
            })
            .map_err(|err| format!("no se pudo arrancar el lector del terminal: {err}"))?;

        let app_wait = app.clone();
        let wait_id = request.session_id.clone();
        thread::spawn(move || {
            let _ = child.wait();
            emit_status(&app_wait, &wait_id, "closed", None);
        });

        emit_status(&app, &request.session_id, "connected", None);
        Ok(())
    }

    pub fn write(
        state: State<'_, PtyManager>,
        session_id: String,
        data: Vec<u8>,
    ) -> Result<(), String> {
        let guard = state
            .sessions
            .lock()
            .map_err(|_| "gestor de terminales locales bloqueado".to_string())?;
        let session = guard
            .get(&session_id)
            .ok_or_else(|| format!("no hay ningún terminal local con id {session_id}"))?;
        if !session.alive.load(Ordering::Relaxed) {
            return Err("el terminal local se ha cerrado".to_string());
        }
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| "el escritor del terminal está bloqueado".to_string())?;
        writer
            .write_all(&data)
            .and_then(|_| writer.flush())
            .map_err(|err| format!("no se pudo escribir en el terminal local: {err}"))
    }

    pub fn resize(
        state: State<'_, PtyManager>,
        session_id: String,
        cols: u32,
        rows: u32,
    ) -> Result<(), String> {
        let guard = state
            .sessions
            .lock()
            .map_err(|_| "gestor de terminales locales bloqueado".to_string())?;
        let session = guard
            .get(&session_id)
            .ok_or_else(|| format!("no hay ningún terminal local con id {session_id}"))?;
        let master = session
            .master
            .lock()
            .map_err(|_| "el terminal local está bloqueado".to_string())?;
        master
            .resize(size_of(cols, rows))
            .map_err(|err| format!("no se pudo redimensionar el terminal local: {err}"))
    }

    pub fn close(
        app: AppHandle,
        state: State<'_, PtyManager>,
        session_id: String,
    ) -> Result<(), String> {
        if let Some(session) = take_session(&state, &session_id) {
            kill_session(&session);
            emit_status(&app, &session_id, "closed", None);
        }
        Ok(())
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::os::windows::process::CommandExt;
    use std::process::{Child, ChildStdin, Command, Stdio};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use tauri::Emitter;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    struct PtySession {
        stdin: Mutex<ChildStdin>,
        child: Mutex<Child>,
        alive: Arc<AtomicBool>,
    }

    #[derive(Default)]
    pub struct PtyManager {
        sessions: Mutex<HashMap<String, Arc<PtySession>>>,
    }

    fn take_session(state: &PtyManager, session_id: &str) -> Option<Arc<PtySession>> {
        state.sessions.lock().ok()?.remove(session_id)
    }

    fn kill_session(session: &PtySession) {
        session.alive.store(false, Ordering::Relaxed);
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }

    fn emit_status(app: &AppHandle, session_id: &str, status: &str, message: Option<String>) {
        let _ = app.emit(
            "pty://status",
            StatusPayload {
                session_id: session_id.to_string(),
                status: status.to_string(),
                message,
            },
        );
    }

    fn emit_data(app: &AppHandle, session_id: &str, data: Vec<u8>) {
        let _ = app.emit(
            "pty://data",
            DataPayload {
                session_id: session_id.to_string(),
                data,
            },
        );
    }

    fn pump_reader<R: Read + Send + 'static>(
        mut reader: R,
        app: AppHandle,
        session_id: String,
        alive: Arc<AtomicBool>,
    ) {
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                if !alive.load(Ordering::Relaxed) {
                    break;
                }
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => emit_data(&app, &session_id, buf[..n].to_vec()),
                    Err(_) => break,
                }
            }
        });
    }

    pub fn open(
        app: AppHandle,
        state: State<'_, PtyManager>,
        request: PtyOpenRequest,
    ) -> Result<(), String> {
        if let Some(previous) = take_session(&state, &request.session_id) {
            kill_session(&previous);
        }

        let program = local_shell_program();
        let mut cmd = Command::new(&program);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("TERM", "xterm-256color")
            .env("COLORTERM", "truecolor")
            .creation_flags(CREATE_NO_WINDOW);

        if program.contains("powershell") || program == "pwsh.exe" {
            cmd.args(["-NoLogo", "-NoExit"]);
        } else if program.contains("cmd") {
            cmd.args(["/d", "/k"]);
        }

        if let Some(dir) = request.cwd.filter(|value| !value.is_empty()) {
            cmd.current_dir(dir);
        } else if let Some(home) = crate::ssh::client::home_from_env() {
            cmd.current_dir(home);
        }

        let mut child = cmd
            .spawn()
            .map_err(|err| format!("no se pudo lanzar {program}: {err}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "el intérprete local no tiene stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "el intérprete local no tiene stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "el intérprete local no tiene stderr".to_string())?;

        let alive = Arc::new(AtomicBool::new(true));
        pump_reader(stdout, app.clone(), request.session_id.clone(), alive.clone());
        pump_reader(stderr, app.clone(), request.session_id.clone(), alive.clone());

        let session = Arc::new(PtySession {
            stdin: Mutex::new(stdin),
            child: Mutex::new(child),
            alive: alive.clone(),
        });

        {
            let mut guard = state
                .sessions
                .lock()
                .map_err(|_| "gestor de terminales locales bloqueado".to_string())?;
            guard.insert(request.session_id.clone(), session.clone());
        }

        let app_wait = app.clone();
        let wait_id = request.session_id.clone();
        let wait_session = session;
        thread::spawn(move || {
            loop {
                let finished = wait_session
                    .child
                    .lock()
                    .ok()
                    .and_then(|mut child| child.try_wait().ok().flatten())
                    .is_some();
                if finished || !alive.load(Ordering::Relaxed) {
                    break;
                }
                thread::sleep(std::time::Duration::from_millis(200));
            }
            alive.store(false, Ordering::Relaxed);
            emit_status(&app_wait, &wait_id, "closed", None);
        });

        emit_status(&app, &request.session_id, "connected", None);
        Ok(())
    }

    pub fn write(
        state: State<'_, PtyManager>,
        session_id: String,
        data: Vec<u8>,
    ) -> Result<(), String> {
        let guard = state
            .sessions
            .lock()
            .map_err(|_| "gestor de terminales locales bloqueado".to_string())?;
        let session = guard
            .get(&session_id)
            .ok_or_else(|| format!("no hay ningún terminal local con id {session_id}"))?;
        if !session.alive.load(Ordering::Relaxed) {
            return Err("el terminal local se ha cerrado".to_string());
        }
        let mut stdin = session
            .stdin
            .lock()
            .map_err(|_| "el escritor del terminal está bloqueado".to_string())?;
        let mut payload = Vec::with_capacity(data.len() + 2);
        for (index, byte) in data.iter().enumerate() {
            payload.push(*byte);
            if *byte == b'\r' && data.get(index + 1) != Some(&b'\n') {
                payload.push(b'\n');
            }
        }
        stdin
            .write_all(&payload)
            .and_then(|_| stdin.flush())
            .map_err(|err| format!("no se pudo escribir en el terminal local: {err}"))
    }

    pub fn resize(
        _state: State<'_, PtyManager>,
        _session_id: String,
        _cols: u32,
        _rows: u32,
    ) -> Result<(), String> {
        Ok(())
    }

    pub fn close(
        app: AppHandle,
        state: State<'_, PtyManager>,
        session_id: String,
    ) -> Result<(), String> {
        if let Some(session) = take_session(&state, &session_id) {
            kill_session(&session);
            emit_status(&app, &session_id, "closed", None);
        }
        Ok(())
    }
}

#[cfg(target_os = "android")]
mod imp {
    use super::*;

    #[derive(Default)]
    pub struct PtyManager;

    pub fn open(
        _app: AppHandle,
        _state: State<'_, PtyManager>,
        _request: PtyOpenRequest,
    ) -> Result<(), String> {
        Err("el terminal local no está disponible en Android".to_string())
    }

    pub fn write(
        _state: State<'_, PtyManager>,
        _session_id: String,
        _data: Vec<u8>,
    ) -> Result<(), String> {
        Err("el terminal local no está disponible en Android".to_string())
    }

    pub fn resize(
        _state: State<'_, PtyManager>,
        _session_id: String,
        _cols: u32,
        _rows: u32,
    ) -> Result<(), String> {
        Err("el terminal local no está disponible en Android".to_string())
    }

    pub fn close(
        _app: AppHandle,
        _state: State<'_, PtyManager>,
        _session_id: String,
    ) -> Result<(), String> {
        Ok(())
    }
}

pub use imp::PtyManager;

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    state: State<'_, PtyManager>,
    request: PtyOpenRequest,
) -> Result<(), String> {
    imp::open(app, state, request)
}

#[tauri::command]
pub fn pty_write(
    state: State<'_, PtyManager>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    imp::write(state, session_id, data)
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    imp::resize(state, session_id, cols, rows)
}

#[tauri::command]
pub fn pty_close(
    app: AppHandle,
    state: State<'_, PtyManager>,
    session_id: String,
) -> Result<(), String> {
    imp::close(app, state, session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_shell_program_is_not_empty() {
        let program = local_shell_program();
        assert!(!program.is_empty(), "el intérprete local no puede estar vacío");
        #[cfg(windows)]
        assert!(
            program.ends_with(".exe"),
            "en Windows el intérprete debe ser un .exe, no {program}"
        );
    }
}
