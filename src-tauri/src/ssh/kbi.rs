//! Autenticación keyboard-interactive y resolución IPv4-primero.
//!
//! Extraído para no reescribir todo `client.rs` al parchear Windows/Linux.

use std::net::ToSocketAddrs;

use russh::client::{Handle, KeyboardInteractiveAuthResponse};

use super::client::ClientHandler;

/// PAM / OpenSSH Windows: el servidor pide retos y espera la contraseña
/// como respuesta, no el método `password`.
pub async fn authenticate_keyboard_interactive(
    handle: &mut Handle<ClientHandler>,
    user: &str,
    password: &str,
) -> Result<bool, String> {
    let mut response = handle
        .authenticate_keyboard_interactive_start(user.to_string(), None)
        .await
        .map_err(|err| format!("keyboard-interactive no arrancó: {err}"))?;

    for _ in 0..8 {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure { .. } => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                let answers = prompts.iter().map(|_| password.to_string()).collect();
                response = handle
                    .authenticate_keyboard_interactive_respond(answers)
                    .await
                    .map_err(|err| format!("keyboard-interactive falló: {err}"))?;
            }
        }
    }
    Err("el servidor pidió demasiados retos keyboard-interactive".to_string())
}

/// Resuelve el host y pone IPv4 delante. En Windows un AAAA sin ruta
/// deja a russh colgado en IPv6 y nunca prueba IPv4.
pub fn resolve_socket_addrs(host: &str, port: u16) -> Result<Vec<std::net::SocketAddr>, String> {
    let mut addrs: Vec<_> = (host, port)
        .to_socket_addrs()
        .map_err(|err| format!("no se resuelve {host}:{port}: {err}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("DNS no devolvió direcciones para {host}"));
    }
    addrs.sort_by_key(|addr| addr.is_ipv6());
    Ok(addrs)
}
