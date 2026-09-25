// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Inicio de sesión con Google.
//!
//! Se usa el flujo de **código de autorización con PKCE** y redirección a
//! `127.0.0.1`, que es el recomendado para aplicaciones de escritorio
//! (RFC 8252). No hace falta ningún secreto de cliente: la prueba de identidad
//! es el verificador PKCE.

use super::{Account, Tokens};

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

/// URI de retorno en Android.
///
/// En el móvil el navegador no puede volver a un puerto local (`127.0.0.1`)
/// como en escritorio, así que Google redirige a este esquema propio y Android
/// entrega la URL a la aplicación mediante el plugin `deep-link`. Debe coincidir
/// con `tauri.conf.json > plugins > deep-link > mobile` y con la URI registrada
/// en Google Cloud para el cliente de tipo Android.
pub const ANDROID_REDIRECT_URI: &str = "cloudterm://callback";



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
    crate::auth::loopback::listen(expected_state, "Google").await
}

pub fn parse_callback(
    params: &std::collections::HashMap<String, String>,
    expected_state: &str,
) -> Result<String, String> {
    crate::auth::loopback::parse_callback(params, expected_state, "Google")
}

/// Interpreta la URL que Android entregó por el esquema propio.
///
/// Recibe `cloudterm://callback?...`, separa la query y la pasa al mismo
/// validador que usa el flujo de escritorio (comprueba `state` y extrae `code`).
pub fn parse_redirect_uri(raw: &str, expected_state: &str) -> Result<String, String> {
    let parsed = url::Url::parse(raw)
        .map_err(|err| format!("URL de vuelta ilegible: {err}"))?;
    let params: std::collections::HashMap<String, String> = parsed
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    parse_callback(&params, expected_state)
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

    /// El esquema propio de Android llega como una URL completa; el código debe
    /// extraerse de su query igual que en el flujo loopback.
    #[test]
    fn redirect_uri_parses_the_code_from_the_query() {
        let raw = "cloudterm://callback?code=el-codigo&state=el-state&scope=openid";
        assert_eq!(
            parse_redirect_uri(raw, "el-state").expect("código"),
            "el-codigo"
        );
    }

    /// Un `state` que no coincide debe rechazarse también por el esquema propio.
    #[test]
    fn redirect_uri_rejects_a_mismatched_state() {
        let raw = "cloudterm://callback?code=el-codigo&state=otro";
        let err = parse_redirect_uri(raw, "el-state").unwrap_err();
        assert!(err.contains("state"), "{err}");
    }

    /// Google puede devolver un error en el esquema propio; hay que mostrarlo.
    #[test]
    fn redirect_uri_reports_an_oauth_error() {
        let raw = "cloudterm://callback?error=access_denied&state=el-state";
        let err = parse_redirect_uri(raw, "el-state").unwrap_err();
        assert!(err.contains("access_denied"), "{err}");
    }

}
