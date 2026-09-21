// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Cliente SSH sobre `russh`: conexión, autenticación y shell interactiva.
//!
//! Parche Windows/Linux: keyboard-interactive, keepalive, PTY y rutas ~\\.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, Handle, KeyboardInteractiveAuthResponse, Msg as ClientMsg};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{Channel, ChannelMsg as SshChannelMsg, Disconnect, Pty};
use russh_sftp::client::SftpSession;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use super::known_hosts::{fingerprint, HostKeyStatus, KnownHosts};
use super::{
    emit_status, forget_session, DataPayload, HostKeyDecision, HostKeyPrompt, HostKeyPrompts,
    SessionCommand, SshAuth, SshConnectRequest, STATUS_CLOSED, STATUS_CONNECTED, STATUS_ERROR,
};

const HOST_KEY_TIMEOUT: Duration = Duration::from_secs(90);

pub struct ClientHandler {
    trust: Option<TrustContext>,
}

pub struct TrustContext {
    app: AppHandle,
    host: String,
    port: u16,
}

impl ClientHandler {
    pub fn insecure() -> Self {
        Self { trust: None }
    }

    pub fn verifying(app: AppHandle, host: String, port: u16) -> Self {
        Self {
            trust: Some(TrustContext { app, host, port }),
        }
    }
}
