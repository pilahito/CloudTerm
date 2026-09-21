// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Redirección OAuth a `127.0.0.1` (RFC 8252).
//!
//! Se abre el navegador del sistema, el usuario inicia sesión en Google o
//! GitHub, y el proveedor devuelve el código a un puerto local. No hay que
//! escribir ningún código a mano.

use std::time::Duration;

const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

/// Escucha en un puerto libre de `127.0.0.1` y espera la redirección.
pub async fn listen(
    expected_state: String,
    provider: &'static str,
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

        let (ok, message) = match parse_callback(&parsed, &expected_state, provider) {
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

pub fn parse_callback(
    params: &std::collections::HashMap<String, String>,
    expected_state: &str,
    provider: &str,
) -> Result<String, String> {
    if let Some(error) = params.get("error") {
        return Err(format!("{provider} rechazó el acceso: {error}"));
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
        (
            "Cuenta vinculada",
            "Ya puedes volver a CloudTerm y cerrar esta pestaña.",
        )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_matching_code() {
        let mut params = std::collections::HashMap::new();
        params.insert("state".into(), "abc".into());
        params.insert("code".into(), "the-code".into());
        assert_eq!(parse_callback(&params, "abc", "GitHub").unwrap(), "the-code");
    }

    #[test]
    fn success_page_is_html() {
        let page = page_for(true, "codigo");
        assert!(page.starts_with("<!doctype html>"));
        assert!(page.contains("Cuenta vinculada"));
    }

    #[test]
    fn rejects_a_mismatched_state() {
        let mut params = std::collections::HashMap::new();
        params.insert("state".into(), "no".into());
        params.insert("code".into(), "x".into());
        assert!(parse_callback(&params, "abc", "GitHub").unwrap_err().contains("state"));
    }
}
