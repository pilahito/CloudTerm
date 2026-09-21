// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

// Cliente SSH sobre russh: conexión, autenticación y shell interactiva.

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

impl TrustContext {
    async fn ask(
        &self,
        event: &str,
        key: &russh::keys::PublicKey,
        old_fingerprint: Option<String>,
    ) -> Option<HostKeyDecision> {
        if self.app.webview_windows().is_empty() {
            return None;
        }

        let (key_type, _) = super::known_hosts::key_parts_for_prompt(key);
        let request_id = format!("hk-{}-{}", self.host, self.port);
        let (sender, receiver) = tokio::sync::oneshot::channel();

        let prompts = self.app.state::<HostKeyPrompts>();
        prompts.0.lock().await.insert(request_id.clone(), sender);

        let _ = self.app.emit(
            event,
            HostKeyPrompt {
                request_id: request_id.clone(),
                host: self.host.clone(),
                port: self.port,
                key_type,
                fingerprint: fingerprint(key),
                old_fingerprint,
            },
        );

        let decision = tokio::time::timeout(HOST_KEY_TIMEOUT, receiver)
            .await
            .ok()
            .and_then(Result::ok);

        self.app.state::<HostKeyPrompts>().0.lock().await.remove(&request_id);
        decision
    }
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let Some(trust) = &self.trust else {
            return Ok(true);
        };

        let public = server_public_key.public_key();
        let Ok(store) = KnownHosts::from_app(&trust.app) else {
            return Ok(true);
        };

        match store.check(&trust.host, trust.port, &public) {
            Ok(HostKeyStatus::Match) => Ok(true),
            Ok(HostKeyStatus::New) => {
                match trust.ask("ssh://host-key-new", &public, None).await {
                    Some(decision) => {
                        if decision.accept && decision.remember {
                            let _ = store.add(&trust.host, trust.port, &public);
                        }
                        Ok(decision.accept)
                    }
                    None => {
                        let _ = store.add(&trust.host, trust.port, &public);
                        Ok(true)
                    }
                }
            }
            Ok(HostKeyStatus::Mismatch { old_fingerprint }) => {
                let decision = trust
                    .ask(
                        "ssh://host-key-mismatch",
                        &public,
                        Some(old_fingerprint),
                    )
                    .await;
                match decision {
                    Some(decision) if decision.accept => {
                        let _ = store.add(&trust.host, trust.port, &public);
                        Ok(true)
                    }
                    _ => Ok(false),
                }
            }
            Err(_) => Ok(true),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SessionParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub term: String,
    pub cols: u32,
    pub rows: u32,
    pub timeout: Duration,
    pub home_dir: Option<PathBuf>,
    pub app: Option<AppHandle>,
}

pub(crate) fn home_from_env() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
        .filter(|value| !value.is_empty())
}

pub fn shellexpand(input: &str) -> String {
    let trimmed = input.trim();
    let Some(home) = home_from_env() else {
        return trimmed.to_string();
    };

    if trimmed == "~" {
        return home;
    }
    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return std::path::PathBuf::from(&home)
            .join(rest)
            .to_string_lossy()
            .into_owned();
    }
    trimmed.replace("$HOME", &home).replace("%USERPROFILE%", &home)
}

pub fn resolve_key_path(home_dir: Option<&Path>, requested: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = requested {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(shellexpand(trimmed));
            if candidate.exists() {
                return Ok(candidate);
            }
            return Err(format!("no existe la clave privada {}", candidate.display()));
        }
    }

    let home = match home_dir {
        Some(home) => home.to_path_buf(),
        None => PathBuf::from(
            home_from_env().ok_or_else(|| "no se pudo resolver el directorio personal".to_string())?,
        ),
    };
    let ssh_dir = home.join(".ssh");
    for name in ["id_ed25519", "id_ecdsa", "id_rsa"] {
        let candidate = ssh_dir.join(name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("no se encontró ninguna clave en ~/.ssh (id_ed25519, id_ecdsa, id_rsa)".to_string())
}
