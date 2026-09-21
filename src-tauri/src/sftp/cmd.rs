// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Línea de comandos del gestor de archivos.
//!
//! Por defecto el comando se ejecuta **en el servidor**, por la misma sesión SSH
//! que usa el panel. Es lo que se espera de una consola dentro de un gestor de
//! archivos remoto: `ls`, `mkdir`, `chmod`, `tar`…
//!
//! Con el prefijo `!` se ejecuta **en el equipo local**, como hace Midnight
//! Commander. El prefijo es explícito a propósito: nada se ejecuta en local sin
//! que quien lo escribe lo haya pedido con esas dos letras.

use super::{get_handle, SftpManager};
use serde::Serialize;
use std::time::Duration;
use tauri::State;

/// Prefijo que cambia la ejecución al equipo local.
pub const PREFIJO_LOCAL: char = '!';

/// Cuánto se espera a que un comando termine, si no se indica otra cosa.
const ESPERA_POR_DEFECTO: Duration = Duration::from_secs(30);

/// Tope de salida que se devuelve a la interfaz.
///
/// Un `cat` de un fichero enorme llenaría la memoria y la ventana. Se recorta y
/// se avisa, en vez de intentar enseñarlo todo.
const MAX_SALIDA: usize = 256 * 1024;

/// Resultado de un comando.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
    /// Código de salida, si el servidor lo informó.
    pub exit_code: Option<u32>,
    /// Se agotó el tiempo de espera y se dejó de escuchar.
    pub timed_out: bool,
    /// La salida se recortó por ser demasiado larga.
    pub truncated: bool,
    /// Si se ejecutó en el servidor o en el equipo local.
    pub scope: String,
}

impl ExecOutput {
    fn nuevo(scope: &str) -> Self {
        Self {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            timed_out: false,
            truncated: false,
            scope: scope.to_string(),
        }
    }

    /// Recorta la salida al tope y marca que se hizo.
    fn recortar(&mut self) {
        if self.stdout.len() > MAX_SALIDA {
            self.stdout.truncate(MAX_SALIDA);
            self.truncated = true;
        }
        if self.stderr.len() > MAX_SALIDA {
            self.stderr.truncate(MAX_SALIDA);
            self.truncated = true;
        }
    }
}

/// Ejecuta un comando en el servidor, por la sesión SSH del panel.
#[tauri::command]
pub async fn sftp_exec(
    state: State<'_, SftpManager>,
    session_id: String,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<ExecOutput, String> {
    let comando = command.trim().to_string();
    if comando.is_empty() {
        return Ok(ExecOutput::nuevo("remote"));
    }

    let handle = get_handle(&state, &session_id).await?;

    use russh::ChannelMsg;
    let mut channel = handle
        ._handle
        .channel_open_session()
        .await
        .map_err(|err| format!("no se pudo abrir un canal en el servidor: {err}"))?;

    channel
        .exec(true, comando.clone().into_bytes())
        .await
        .map_err(|err| format!("no se pudo ejecutar «{comando}»: {err}"))?;

    let mut salida = ExecOutput::nuevo("remote");
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let presupuesto = Duration::from_millis(timeout_ms.unwrap_or(ESPERA_POR_DEFECTO.as_millis() as u64));
    let limite = tokio::time::Instant::now() + presupuesto;

    loop {
        let restante = limite.saturating_duration_since(tokio::time::Instant::now());
        if restante.is_zero() {
            salida.timed_out = true;
            break;
        }

        match tokio::time::timeout(restante, channel.wait()).await {
            Ok(Some(ChannelMsg::Data { data })) => stdout.extend_from_slice(&data),
            // El flujo 1 es stderr; cualquier otro se trata como salida normal.
            Ok(Some(ChannelMsg::ExtendedData { data, ext })) => {
                if ext == 1 {
                    stderr.extend_from_slice(&data);
                } else {
                    stdout.extend_from_slice(&data);
                }
            }
            Ok(Some(ChannelMsg::ExitStatus { exit_status })) => {
                salida.exit_code = Some(exit_status);
            }
            Ok(Some(ChannelMsg::Eof)) | Ok(Some(ChannelMsg::Close)) | Ok(None) => break,
            Ok(Some(_)) => {}
            Err(_) => {
                salida.timed_out = true;
                break;
            }
        }
    }

    let _ = channel.close().await;

    salida.stdout = String::from_utf8_lossy(&stdout).to_string();
    salida.stderr = String::from_utf8_lossy(&stderr).to_string();
    salida.recortar();
    Ok(salida)
}

/// Ejecuta un comando en el equipo local.
///
/// Solo lo llama `sftp_exec_linea`, y solo cuando la línea empieza por `!`.
#[tauri::command]
pub async fn local_exec(command: String, timeout_ms: Option<u64>) -> Result<ExecOutput, String> {
    let comando = command.trim().to_string();
    if comando.is_empty() {
        return Ok(ExecOutput::nuevo("local"));
    }

    let mut proceso = shell_local(&comando);

    let presupuesto =
        Duration::from_millis(timeout_ms.unwrap_or(ESPERA_POR_DEFECTO.as_millis() as u64));

    let mut salida = ExecOutput::nuevo("local");

    match tokio::time::timeout(presupuesto, proceso.output()).await {
        Ok(Ok(resultado)) => {
            salida.stdout = String::from_utf8_lossy(&resultado.stdout).to_string();
            salida.stderr = String::from_utf8_lossy(&resultado.stderr).to_string();
            salida.exit_code = resultado.status.code().map(|code| code as u32);
        }
        Ok(Err(err)) => return Err(format!("no se pudo ejecutar «{comando}»: {err}")),
        Err(_) => salida.timed_out = true,
    }

    salida.recortar();
    Ok(salida)
}

/// Prepara el intérprete de órdenes del sistema.
fn shell_local(comando: &str) -> tokio::process::Command {
    #[cfg(windows)]
    {
        let mut cmd = windows_shell(comando);
        // Sin esto, cada `!comando` abre un parpadeo de consola negra.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = tokio::process::Command::new("sh");
        cmd.arg("-c").arg(comando);
        cmd
    }
}

#[cfg(windows)]
fn windows_shell(comando: &str) -> tokio::process::Command {
    for program in ["pwsh", "powershell"] {
        if command_exists(program) {
            let mut cmd = tokio::process::Command::new(program);
            cmd.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"])
                .arg(comando);
            return cmd;
        }
    }
    let mut cmd = tokio::process::Command::new("cmd");
    cmd.arg("/d").arg("/c").arg(comando);
    cmd
}

#[cfg(windows)]
fn command_exists(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|dir| {
        ["", ".exe", ".cmd", ".bat"].iter().any(|ext| {
            let name = if ext.is_empty() {
                program.to_string()
            } else {
                format!("{program}{ext}")
            };
            dir.join(name).is_file()
        })
    })
}

/// Decide dónde ejecutar una línea escrita en la consola.
///
/// Devuelve `(es_local, comando_sin_prefijo)`.
pub fn clasificar(linea: &str) -> (bool, String) {
    let recortada = linea.trim();
    match recortada.strip_prefix(PREFIJO_LOCAL) {
        Some(resto) => (true, resto.trim().to_string()),
        None => (false, recortada.to_string()),
    }
}

/// Ejecuta una línea de la consola, decidiendo el destino por el prefijo.
#[tauri::command]
pub async fn exec_linea(
    state: State<'_, SftpManager>,
    session_id: Option<String>,
    line: String,
    timeout_ms: Option<u64>,
) -> Result<ExecOutput, String> {
    let (es_local, comando) = clasificar(&line);

    if es_local {
        return local_exec(comando, timeout_ms).await;
    }

    let Some(session_id) = session_id.filter(|id| !id.is_empty()) else {
        return Err(
            "no hay ninguna sesión SFTP abierta; con «!» delante el comando se ejecutaría en tu equipo"
                .to_string(),
        );
    };

    sftp_exec(state, session_id, comando, timeout_ms).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_prefix_commands_go_to_the_server() {
        let (local, comando) = clasificar("ls -la /var/log");
        assert!(!local);
        assert_eq!(comando, "ls -la /var/log");
    }

    #[test]
    fn the_bang_prefix_runs_locally() {
        let (local, comando) = clasificar("!uname -a");
        assert!(local);
        assert_eq!(comando, "uname -a");
    }

    #[test]
    fn the_prefix_tolerates_spaces() {
        let (local, comando) = clasificar("   !   pwd   ");
        assert!(local);
        assert_eq!(comando, "pwd");

        let (local, comando) = clasificar("  ls  ");
        assert!(!local);
        assert_eq!(comando, "ls");
    }

    /// Un `!` suelto no es un comando: se queda vacío y no se ejecuta nada.
    #[test]
    fn a_lone_bang_is_an_empty_local_command() {
        let (local, comando) = clasificar("!");
        assert!(local);
        assert_eq!(comando, "");
    }

    /// Un `!` en medio de la línea no cuenta: es parte del comando.
    #[test]
    fn a_bang_in_the_middle_is_not_a_prefix() {
        let (local, comando) = clasificar("echo hola!");
        assert!(!local);
        assert_eq!(comando, "echo hola!");
    }

    #[tokio::test]
    async fn a_local_command_reports_its_output() {
        // `echo` existe tanto en `sh` como en `cmd`, así que sirve en cualquier
        // sistema donde corran las pruebas.
        let salida = local_exec("echo cloudterm-cmd-ok".to_string(), Some(10_000))
            .await
            .expect("debería ejecutarse");

        assert!(!salida.timed_out, "no debería agotarse el tiempo");
        assert_eq!(salida.scope, "local");
        assert_eq!(salida.exit_code, Some(0));
        assert!(
            salida.stdout.contains("cloudterm-cmd-ok"),
            "salida inesperada: {:?}",
            salida.stdout
        );
    }

    #[tokio::test]
    async fn a_failing_local_command_reports_a_nonzero_code() {
        let salida = local_exec("exit 3".to_string(), Some(10_000))
            .await
            .expect("debería ejecutarse");

        assert_eq!(salida.exit_code, Some(3));
    }

    #[tokio::test]
    async fn an_empty_command_does_nothing() {
        let salida = local_exec("   ".to_string(), None).await.expect("sin error");
        assert_eq!(salida.stdout, "");
        assert_eq!(salida.exit_code, None);
    }
}
