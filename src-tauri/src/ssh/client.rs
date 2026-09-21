// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Cliente SSH sobre `russh`: conexión, autenticación y shell interactiva.
//!
//! El núcleo ([`open_shell`]) es **independiente de Tauri**, de modo que puede
//! probarse contra un servidor real sin levantar la aplicación. La capa Tauri
//! ([`open_session`]) añade la resolución de rutas del sistema, los eventos
//! hacia el frontend y las tareas de E/S.
//!
//! Flujo de una sesión:
//!
//! 1. `client::connect` con un [`ClientHandler`] propio.
//! 2. Autenticación por contraseña o por clave (con detección automática de
//!    `~/.ssh/id_ed25519`, `id_ecdsa` e `id_rsa` si no se indica ruta).
//! 3. `channel_open_session` + `request_pty` + `request_shell`.
//! 4. `split()` del canal en mitades de lectura y escritura, cada una en su
//!    propia tarea de Tokio. Así lectura y escritura nunca se bloquean entre sí
//!    y no hace falta `select!` (que obligaría a razonar sobre la cancelación
//!    de `Channel::wait`).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, Handle, KeyboardInteractiveAuthResponse, Msg as ClientMsg};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{Channel, ChannelMsg as SshChannelMsg, Disconnect};
use std::net::ToSocketAddrs;
use russh_sftp::client::SftpSession;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use super::known_hosts::{fingerprint, HostKeyStatus, KnownHosts};
use super::{
    emit_status, forget_session, DataPayload, HostKeyDecision, HostKeyPrompt, HostKeyPrompts,
    SessionCommand, SshAuth, SshConnectRequest, STATUS_CLOSED, STATUS_CONNECTED, STATUS_ERROR,
};

/// Cuánto se espera a que el usuario decida sobre una clave desconocida o
/// cambiada antes de aplicar la política por defecto.
const HOST_KEY_TIMEOUT: Duration = Duration::from_secs(90);

/// Manejador de eventos del cliente.
///
/// Verifica la clave del servidor contra `known_hosts`: acepta la conocida,
/// pregunta por la desconocida y **rechaza** la que ha cambiado. Sin `trust`
/// (pruebas) no hay a quién preguntar y se acepta, que es lo que quieren las
/// pruebas de integración contra un servidor local.
pub struct ClientHandler {
    trust: Option<TrustContext>,
}

/// Lo que hace falta para verificar y preguntar.
pub struct TrustContext {
    app: AppHandle,
    host: String,
    port: u16,
}

impl ClientHandler {
    /// Manejador que no verifica nada. Solo para pruebas.
    pub fn insecure() -> Self {
        Self { trust: None }
    }

    /// Manejador que contrasta la clave contra el `known_hosts` de la aplicación.
    pub fn verifying(app: AppHandle, host: String, port: u16) -> Self {
        Self {
            trust: Some(TrustContext { app, host, port }),
        }
    }
}
