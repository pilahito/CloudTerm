// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Inicio de sesión con GitHub.
//!
//! Se abre el **navegador** con el flujo de código de autorización y PKCE, igual
//! que Google. El usuario inicia sesión en github.com y GitHub redirige a
//! `127.0.0.1`. No hay que escribir ningún código a mano.
//!
//! GitHub todavía pide a veces el *client secret* al canjear el código. Si el
//! usuario lo pega en Ajustes, se guarda en el llavero. Si no hace falta, se
//! omite.

use super::{Account, Tokens};
use std::time::Duration;

const AUTHORIZE_URL: &str = "https://github.com/login/oauth/authorize";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const USER_URL: &str = "https://api.github.com/user";
const EMAILS_URL: &str = "https://api.github.com/user/emails";

/// Permisos que se piden.
///
/// `read:user` y `user:email` para saber quién ha entrado, y `gist` para
/// guardar la copia de seguridad de los hosts en un gist secreto.
pub const SCOPES: &str = "read:user user:email gist";

/// GitHub rechaza las peticiones sin `User-Agent`.
pub const USER_AGENT: &str = "CloudTerm";

/// Lo que hay que enseñarle al usuario para que autorice.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    /// Segundos mínimos entre sondeos.
    pub interval: u64,
}

/// Resultado de un sondeo.
#[derive(Debug, PartialEq, Eq)]
pub enum PollOutcome {
    /// Ya está autorizado; el cuerpo trae los tokens.
    Token(Tokens),
    /// El usuario todavía no lo ha escrito.
    Pending,
    /// Hay que ir más despacio.
    SlowDown,
    /// El código caducó.
    Expired,
    /// El usuario lo rechazó.
    Denied,
}

/// URL que se abre en el navegador.
pub fn authorize_url(client_id: &str, redirect_uri: &str, state: &str, challenge: &str) -> String {
    let mut url = url::Url::parse(AUTHORIZE_URL).expect("URL de GitHub válida");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", SCOPES)
        .append_pair("state", state)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256");
    url.to_string()
}

/// Canjea el código de autorización por un token.
pub async fn exchange_code(
    client: &reqwest::Client,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<Tokens, String> {
    let mut form = vec![
        ("client_id", client_id),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier),
    ];
    if let Some(secret) = client_secret.filter(|s| !s.is_empty()) {
        form.push(("client_secret", secret));
    }

    let response = client
        .post(TOKEN_URL)
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .map_err(|err| format!("no se pudo canjear el código: {err}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    if !status.is_success() {
        return Err(format!("GitHub rechazó el canje ({status}): {body}"));
    }

    tokens_from_github(&body)
}

pub fn tokens_from_github(body: &str) -> Result<Tokens, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|err| format!("respuesta ilegible de GitHub: {err} ({body})"))?;

    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        let detail = value
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if error == "incorrect_client_credentials" || detail.contains("client_secret") {
            return Err(
                "GitHub pide el secreto de cliente para vincular la cuenta por el navegador. Pégalo en Ajustes → Cuenta; se guarda en el llavero."
                    .to_string(),
            );
        }
        return Err(format!("GitHub rechazó el canje: {error} {detail}"));
    }

    let access_token = value
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "GitHub no devolvió ningún token de acceso".to_string())?
        .to_string();

    Ok(Tokens {
        access_token,
        refresh_token: value
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        expires_at: None,
        scopes: value
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

fn client_with_headers() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|err| format!("no se pudo crear el cliente HTTP: {err}"))
}

/// Solicita un código de dispositivo.
pub async fn start_device_flow(
    client: &reqwest::Client,
    client_id: &str,
) -> Result<DeviceCode, String> {
    let response = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", SCOPES)])
        .send()
        .await
        .map_err(|err| format!("no se pudo pedir el código de dispositivo: {err}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    if !status.is_success() {
        return Err(format!("GitHub rechazó la petición ({status}): {body}"));
    }

    parse_device_code(&body)
}

/// Interpreta la respuesta del endpoint de tokens.
pub fn parse_device_code(body: &str) -> Result<DeviceCode, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|err| format!("respuesta ilegible de GitHub: {err} ({body})"))?;

    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        let detail = value
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(format!("GitHub rechazó el código de dispositivo: {error} {detail}"));
    }

    let text = |key: &str| -> Result<String, String> {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .ok_or_else(|| format!("la respuesta de GitHub no traía «{key}»"))
    };

    Ok(DeviceCode {
        device_code: text("device_code")?,
        user_code: text("user_code")?,
        verification_uri: text("verification_uri")?,
        expires_in: value.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(900),
        // GitHub recomienda 5 s si no lo indica.
        interval: value.get("interval").and_then(|v| v.as_u64()).unwrap_or(5),
    })
}

/// Interpreta un sondeo del endpoint de tokens.
pub fn interpret_poll(body: &str) -> Result<PollOutcome, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|err| format!("respuesta ilegible de GitHub: {err} ({body})"))?;

    if let Some(token) = value.get("access_token").and_then(|v| v.as_str()) {
        return Ok(PollOutcome::Token(Tokens {
            access_token: token.to_string(),
            refresh_token: None,
            expires_at: None,
            scopes: value
                .get("scope")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
        }));
    }

    match value.get("error").and_then(|v| v.as_str()).unwrap_or("") {
        "authorization_pending" => Ok(PollOutcome::Pending),
        "slow_down" => Ok(PollOutcome::SlowDown),
        "expired_token" => Ok(PollOutcome::Expired),
        "access_denied" => Ok(PollOutcome::Denied),
        other => Err(format!("GitHub devolvió un error inesperado: {other}")),
    }
}

/// Sondea hasta que el usuario autoriza, el código caduca o se agota el tiempo.
///
/// `on_pending` se llama en cada sondeo sin éxito, para poder informar avisos.
pub async fn poll_for_token<F>(
    client: &reqwest::Client,
    client_id: &str,
    device: &DeviceCode,
    mut on_pending: F,
) -> Result<Tokens, String>
where
    F: FnMut(),
{
    let deadline = tokio::time::Instant::now() + Duration::from_secs(device.expires_in);
    let mut interval = Duration::from_secs(device.interval.max(1));

    loop {
        if tokio::time::Instant::now() >= deadline {
            return Err("el código de dispositivo caducó; vuelve a intentarlo".to_string());
        }

        let response = client
            .post(TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("device_code", device.device_code.as_str()),
                (
                    "grant_type",
                    "urn:ietf:params:oauth:grant-type:device_code",
                ),
            ])
            .send()
            .await
            .map_err(|err| format!("no se pudo comprobar la autorización: {err}"))?;

        let body = response
            .text()
            .await
            .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

        match interpret_poll(&body)? {
            PollOutcome::Token(tokens) => return Ok(tokens),
            PollOutcome::Pending => on_pending(),
            PollOutcome::SlowDown => {
                // GitHub pide explícitamente esperar más.
                interval += Duration::from_secs(5);
                on_pending();
            }
            PollOutcome::Expired => {
                return Err("el código de dispositivo caducó; vuelve a intentarlo".to_string())
            }
            PollOutcome::Denied => return Err("cancelaste la autorización en GitHub".to_string()),
        }

        tokio::time::sleep(interval).await;
    }
}

/// Datos de la cuenta que acaba de entrar.
pub async fn user(client: &reqwest::Client, access_token: &str) -> Result<Account, String> {
    let response = client
        .get(USER_URL)
        .header("Accept", "application/vnd.github+json")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|err| format!("no se pudo leer la cuenta: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub devolvió {}", response.status()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    let text = |key: &str| {
        body.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };

    let login = text("login");
    let mut email = text("email");

    // El correo solo viene si es público; se pide aparte si hace falta.
    if email.is_empty() {
        email = primary_email(client, access_token).await.unwrap_or_default();
    }

    Ok(Account {
        provider: super::AuthProvider::GitHub,
        id: body
            .get("id")
            .map(|v| v.to_string())
            .unwrap_or_default(),
        name: {
            let name = text("name");
            if name.is_empty() {
                login
            } else {
                name
            }
        },
        email,
        avatar_url: text("avatar_url"),
    })
}

/// Correo principal de la cuenta, de los que devuelve `/user/emails`.
pub async fn primary_email(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<String, String> {
    let response = client
        .get(EMAILS_URL)
        .header("Accept", "application/vnd.github+json")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|err| format!("no se pudieron leer los correos: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub devolvió {}", response.status()));
    }

    let list: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    Ok(primary_email_from(&list))
}

/// Elige el correo principal de la lista, prefiriendo el marcado como primario
/// y, si no lo hay, el primero verificado.
pub fn primary_email_from(list: &[serde_json::Value]) -> String {
    let pick = |want_primary: bool| {
        list.iter()
            .find(|item| {
                item.get("primary").and_then(|v| v.as_bool()).unwrap_or(false) == want_primary
                    && item.get("verified").and_then(|v| v.as_bool()).unwrap_or(false)
            })
            .and_then(|item| item.get("email").and_then(|v| v.as_str()))
            .map(str::to_string)
    };

    pick(true).or_else(|| pick(false)).unwrap_or_default()
}

/// Cliente HTTP con el `User-Agent` que GitHub exige.
pub fn http_client() -> Result<reqwest::Client, String> {
    client_with_headers()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_url_opens_github_in_the_browser() {
        let url = authorize_url(
            "Iv1.abc",
            "http://127.0.0.1:4444/callback",
            "el-state",
            "el-reto",
        );
        assert!(url.starts_with(AUTHORIZE_URL), "{url}");
        for fragment in [
            "code_challenge=el-reto",
            "code_challenge_method=S256",
            "state=el-state",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A4444%2Fcallback",
        ] {
            assert!(url.contains(fragment), "falta {fragment} en {url}");
        }
    }

    #[test]
    fn tokens_from_github_reads_the_access_token() {
        let tokens = tokens_from_github(r#"{"access_token":"gho_x","scope":"gist"}"#).unwrap();
        assert_eq!(tokens.access_token, "gho_x");
        assert_eq!(tokens.scopes, "gist");
    }

    #[test]
    fn tokens_from_github_explains_a_missing_secret() {
        let err = tokens_from_github(
            r#"{"error":"incorrect_client_credentials","error_description":"The client_secret passed does not match."}"#,
        )
        .unwrap_err();
        assert!(err.contains("secreto de cliente"), "{err}");
    }

    #[test]
    fn parses_a_device_code() {
        let body = r#"{
            "device_code": "dc-123",
            "user_code": "WDJB-MJHT",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        }"#;
        let device = parse_device_code(body).expect("debería interpretarlo");

        assert_eq!(device.device_code, "dc-123");
        assert_eq!(device.user_code, "WDJB-MJHT");
        assert_eq!(device.interval, 5);
        assert_eq!(device.expires_in, 900);
    }

    #[test]
    fn a_device_code_error_is_reported() {
        let body = r#"{"error":"unauthorized_client","error_description":"bad client"}"#;
        let err = parse_device_code(body).unwrap_err();
        assert!(err.contains("unauthorized_client"), "{err}");
    }

    #[test]
    fn a_missing_field_is_reported() {
        let body = r#"{"user_code":"WDJB-MJHT"}"#;
        let err = parse_device_code(body).unwrap_err();
        assert!(err.contains("device_code"), "{err}");
    }

    #[test]
    fn poll_pending_and_slow_down_are_distinguished() {
        assert_eq!(
            interpret_poll(r#"{"error":"authorization_pending"}"#).unwrap(),
            PollOutcome::Pending
        );
        assert_eq!(
            interpret_poll(r#"{"error":"slow_down"}"#).unwrap(),
            PollOutcome::SlowDown
        );
        assert_eq!(
            interpret_poll(r#"{"error":"expired_token"}"#).unwrap(),
            PollOutcome::Expired
        );
        assert_eq!(
            interpret_poll(r#"{"error":"access_denied"}"#).unwrap(),
            PollOutcome::Denied
        );
    }

    #[test]
    fn poll_with_a_token_returns_it() {
        let body = r#"{"access_token":"gho_abc","token_type":"bearer","scope":"gist"}"#;
        match interpret_poll(body).unwrap() {
            PollOutcome::Token(tokens) => {
                assert_eq!(tokens.access_token, "gho_abc");
                assert_eq!(tokens.scopes, "gist");
            }
            other => panic!("se esperaba Token, llegó {other:?}"),
        }
    }

    #[test]
    fn an_unknown_poll_error_is_reported() {
        let err = interpret_poll(r#"{"error":"algo_raro"}"#).unwrap_err();
        assert!(err.contains("algo_raro"), "{err}");
    }

    #[test]
    fn picks_the_primary_verified_email() {
        let list = serde_json::json!([
            {"email": "viejo@example.com", "primary": false, "verified": true},
            {"email": "principal@example.com", "primary": true, "verified": true}
        ]);
        assert_eq!(
            primary_email_from(list.as_array().unwrap()),
            "principal@example.com"
        );
    }

    /// Un correo principal sin verificar no vale; se prefiere uno verificado.
    #[test]
    fn skips_unverified_emails() {
        let list = serde_json::json!([
            {"email": "sinverificar@example.com", "primary": true, "verified": false},
            {"email": "verificado@example.com", "primary": false, "verified": true}
        ]);
        assert_eq!(
            primary_email_from(list.as_array().unwrap()),
            "verificado@example.com"
        );
    }

    #[test]
    fn an_empty_email_list_gives_an_empty_string() {
        assert_eq!(primary_email_from(&[]), "");
    }
}
