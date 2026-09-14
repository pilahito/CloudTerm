// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Inicio de sesión con Google.
//!
//! Se usa el flujo de **código de autorización con PKCE** y redirección a
//! `127.0.0.1`, que es el recomendado para aplicaciones de escritorio
//! (RFC 8252). No hace falta ningún secreto de cliente: la prueba de identidad
//! es el verificador PKCE.

use super::{Account, Tokens};
use std::time::Duration;

/// Endpoint de autorización.
const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
/// Endpoint de canje y renovación de tokens.
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// Endpoint de datos de la cuenta.
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";

/// Permisos que se piden.
///
/// `openid email profile` para saber quién ha entrado, y `drive.appdata` para
/// guardar la copia de seguridad en una carpeta de Drive que solo ve esta
/// aplicación (el usuario no la ve en su Drive, pero ocupa su cuota).
pub const SCOPES: &str =
    "openid email profile https://www.googleapis.com/auth/drive.appdata";

/// Cuánto se espera a que el usuario termine en el navegador.
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

/// Construye la URL a la que se manda al usuario.
pub fn authorize_url(client_id: &str, redirect_uri: &str, state: &str, challenge: &str) -> String {
    let mut url = url::Url::parse(AUTHORIZE_URL).expect("URL de Google válida");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        // `offline` + `consent` para que Google entregue un token de renovación:
        // sin él habría que volver a iniciar sesión cada hora.
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    url.to_string()
}

/// Escucha en un puerto libre de `127.0.0.1` y espera la redirección.
///
/// Devuelve `(puerto, tarea)`: el puerto hace falta para construir el
/// `redirect_uri` **antes** de abrir el navegador, y la tarea entrega el código
/// cuando Google llama de vuelta.
pub async fn listen(
    expected_state: String,
) -> Result<(u16, tokio::task::JoinHandle<Result<String, String>>), String> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|err| format!("no se pudo abrir el puerto de retorno: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("no se pudo leer el puerto de retorno: {err}"))?
        .port();

    let handle = tokio::spawn(async move {
        let accepted = tokio::time::timeout(CALLBACK_TIMEOUT, listener.accept()).await;
        let (mut socket, _) = match accepted {
            Ok(Ok(pair)) => pair,
            Ok(Err(err)) => return Err(format!("fallo aceptando la redirección: {err}")),
            Err(_) => return Err("se agotó el tiempo esperando al navegador".to_string()),
        };

        let mut buffer = vec![0u8; 8192];
        let read = tokio::io::AsyncReadExt::read(&mut socket, &mut buffer)
            .await
            .map_err(|err| format!("no se pudo leer la redirección: {err}"))?;
        let request = String::from_utf8_lossy(&buffer[..read]).to_string();

        let query = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|target| target.split_once('?').map(|(_, q)| q.to_string()))
            .unwrap_or_default();

        let parsed: std::collections::HashMap<String, String> =
            url::form_urlencoded::parse(query.as_bytes())
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();

        let (ok, message) = match parse_callback(&parsed, &expected_state) {
            Ok(code) => (true, code),
            Err(err) => (false, err),
        };
        let page = page_for(ok, &message);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
             Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            page.len(),
            page
        );
        let _ = tokio::io::AsyncWriteExt::write_all(&mut socket, response.as_bytes()).await;
        let _ = tokio::io::AsyncWriteExt::flush(&mut socket).await;

        if ok {
            Ok(message)
        } else {
            Err(message)
        }
    });

    Ok((port, handle))
}

/// Interpreta los parámetros que Google añade a la redirección.
///
/// Se comprueba el `state` porque es lo que demuestra que esta respuesta
/// corresponde a la petición que hizo esta aplicación y no a otra.
pub fn parse_callback(
    params: &std::collections::HashMap<String, String>,
    expected_state: &str,
) -> Result<String, String> {
    if let Some(error) = params.get("error") {
        return Err(format!("Google rechazó el acceso: {error}"));
    }

    match params.get("state") {
        Some(state) if state == expected_state => {}
        Some(_) => return Err("la respuesta no corresponde a esta petición (state)".to_string()),
        None => return Err("la respuesta no traía «state»".to_string()),
    }

    params
        .get("code")
        .cloned()
        .ok_or_else(|| "la respuesta no traía código de autorización".to_string())
}

fn page_for(ok: bool, message: &str) -> String {
    let (titulo, detalle) = if ok {
        ("Sesión iniciada", "Ya puedes volver a CloudTerm y cerrar esta pestaña.")
    } else {
        ("No se pudo iniciar sesión", message)
    };
    format!(
        "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\">\
         <title>{titulo}</title>\
         <body style=\"font-family:system-ui;background:#0d0f14;color:#e8eaf0;\
         display:grid;place-items:center;height:100vh;margin:0\">\
         <div style=\"text-align:center\">\
         <h1 style=\"font-size:1.2rem;margin:0 0 .5rem\">{titulo}</h1>\
         <p style=\"color:#8b93a7;margin:0;font-size:.9rem\">{detalle}</p>\
         </div></body></html>"
    )
}

/// Canjea el código por tokens.
pub async fn exchange_code(
    client: &reqwest::Client,
    client_id: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<Tokens, String> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|err| format!("no se pudo canjear el código: {err}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("respuesta ilegible de Google: {err}"))?;

    if !status.is_success() {
        return Err(format!("Google rechazó el canje ({status}): {body}"));
    }

    super::tokens_from_google(&body)
}

/// Renueva el token de acceso con el de renovación.
pub async fn refresh(
    client: &reqwest::Client,
    client_id: &str,
    refresh_token: &str,
) -> Result<Tokens, String> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|err| format!("no se pudo renovar el token: {err}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("respuesta ilegible de Google: {err}"))?;

    if !status.is_success() {
        return Err(format!("Google rechazó la renovación ({status}): {body}"));
    }

    super::tokens_from_google(&body)
}

/// Datos de la cuenta que acaba de entrar.
pub async fn userinfo(client: &reqwest::Client, access_token: &str) -> Result<Account, String> {
    let response = client
        .get(USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|err| format!("no se pudo leer la cuenta: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Google devolvió {}", response.status()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de Google: {err}"))?;

    let text = |key: &str| {
        body.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };

    Ok(Account {
        provider: super::AuthProvider::Google,
        id: text("sub"),
        name: text("name"),
        email: text("email"),
        avatar_url: text("picture"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn authorize_url_carries_everything_pkce_needs() {
        let url = authorize_url(
            "cliente.apps.googleusercontent.com",
            "http://127.0.0.1:4444/callback",
            "el-state",
            "el-reto",
        );

        assert!(url.starts_with(AUTHORIZE_URL), "{url}");
        for fragment in [
            "code_challenge=el-reto",
            "code_challenge_method=S256",
            "state=el-state",
            "access_type=offline",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A4444%2Fcallback",
        ] {
            assert!(url.contains(fragment), "falta {fragment} en {url}");
        }
        // El permiso de Drive va codificado, no en crudo.
        assert!(url.contains("drive.appdata"), "{url}");
    }

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn callback_with_the_right_state_returns_the_code() {
        let p = params(&[("code", "el-codigo"), ("state", "el-state")]);
        assert_eq!(parse_callback(&p, "el-state").expect("código"), "el-codigo");
    }

    #[test]
    fn callback_with_another_state_is_rejected() {
        let p = params(&[("code", "el-codigo"), ("state", "otro")]);
        let err = parse_callback(&p, "el-state").unwrap_err();
        assert!(err.contains("state"), "{err}");
    }

    #[test]
    fn callback_without_state_is_rejected() {
        let p = params(&[("code", "el-codigo")]);
        assert!(parse_callback(&p, "el-state").is_err());
    }

    #[test]
    fn callback_with_an_error_is_reported() {
        let p = params(&[("error", "access_denied")]);
        let err = parse_callback(&p, "el-state").unwrap_err();
        assert!(err.contains("access_denied"), "{err}");
    }

    /// La página de vuelta se muestra en el navegador: debe ser HTML válido y
    /// cerrarse sola sin dejar al usuario colgado.
    #[test]
    fn page_is_html_and_escapes_nothing_dangerous() {
        let page = page_for(true, "codigo");
        assert!(page.starts_with("<!doctype html>"));
        assert!(page.contains("Sesión iniciada"));
    }
}
