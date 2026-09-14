// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Copia de seguridad de los datos del usuario en su propia cuenta.
//!
//! No hay servidor intermedio: los hosts y los ajustes se guardan en un sitio
//! que ya es del usuario.
//!
//! - **GitHub**: un *gist* secreto llamado `cloudterm-backup.json`.
//! - **Google**: un fichero en la carpeta `appDataFolder` de Drive, que solo ve
//!   esta aplicación y no aparece en el Drive del usuario.
//!
//! El contenido es el mismo en los dos casos, así que una copia hecha con una
//! cuenta se puede restaurar con la otra.

use serde::{Deserialize, Serialize};

/// Nombre del fichero remoto. Es también la marca que identifica la copia.
pub const FILE_NAME: &str = "cloudterm-backup.json";

/// Versión del formato, para poder evolucionar sin romper copias antiguas.
pub const FORMAT_VERSION: u32 = 1;

const GISTS_URL: &str = "https://api.github.com/gists";
const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";

/// Documento que se guarda.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub version: u32,
    /// Milisegundos desde la época, para poder comparar copias.
    pub exported_at: i64,
    /// Hosts tal y como los devuelve la base de datos.
    pub hosts: Vec<serde_json::Value>,
    /// Ajustes sueltos (tema, preferencias…).
    #[serde(default)]
    pub settings: serde_json::Value,
}

/// Resultado de una sincronización, para poder decírselo al usuario.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub provider: String,
    pub action: String,
    pub hosts: usize,
    pub destination: String,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Empaqueta los datos en el JSON que se sube.
pub fn build(
    hosts: Vec<serde_json::Value>,
    settings: serde_json::Value,
) -> Result<String, String> {
    let backup = Backup {
        version: FORMAT_VERSION,
        exported_at: now_ms(),
        hosts,
        settings,
    };
    serde_json::to_string_pretty(&backup)
        .map_err(|err| format!("no se pudo preparar la copia: {err}"))
}

/// Lee y valida una copia descargada.
pub fn parse(raw: &str) -> Result<Backup, String> {
    let backup: Backup =
        serde_json::from_str(raw).map_err(|err| format!("la copia no es válida: {err}"))?;

    if backup.version > FORMAT_VERSION {
        return Err(format!(
            "la copia es de una versión más nueva de CloudTerm ({} > {FORMAT_VERSION})",
            backup.version
        ));
    }
    Ok(backup)
}

/* -------------------------------------------------------------------------- */
/* GitHub: gist secreto                                                       */
/* -------------------------------------------------------------------------- */

/// Cabeceras que exige la API de GitHub.
fn github_headers(request: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    request
        .header("Accept", "application/vnd.github+json")
        .bearer_auth(token)
}

/// Identificador del gist de copia, si ya existe.
pub async fn find_gist(
    client: &reqwest::Client,
    token: &str,
) -> Result<Option<String>, String> {
    let response = github_headers(client.get(GISTS_URL), token)
        .query(&[("per_page", "100")])
        .send()
        .await
        .map_err(|err| format!("no se pudieron listar los gists: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub devolvió {}", response.status()));
    }

    let gists: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    Ok(gist_id_from(&gists))
}

/// Busca, entre los gists devueltos, el que contiene el fichero de copia.
pub fn gist_id_from(gists: &[serde_json::Value]) -> Option<String> {
    gists
        .iter()
        .find(|gist| {
            gist.get("files")
                .and_then(|files| files.get(FILE_NAME))
                .is_some()
        })
        .and_then(|gist| gist.get("id"))
        .and_then(|id| id.as_str())
        .map(str::to_string)
}

/// Sube la copia: actualiza el gist existente o crea uno nuevo.
pub async fn push_gist(
    client: &reqwest::Client,
    token: &str,
    content: &str,
) -> Result<SyncOutcome, String> {
    let files = serde_json::json!({ FILE_NAME: { "content": content } });
    let existing = find_gist(client, token).await?;

    let (request, action, destination) = match &existing {
        Some(id) => (
            github_headers(client.patch(format!("{GISTS_URL}/{id}")), token),
            "actualizada",
            format!("https://gist.github.com/{id}"),
        ),
        None => (
            github_headers(client.post(GISTS_URL), token),
            "creada",
            "gist secreto".to_string(),
        ),
    };

    let body = match &existing {
        Some(_) => serde_json::json!({ "files": files }),
        None => serde_json::json!({
            "description": "Copia de seguridad de CloudTerm (hosts y ajustes)",
            "public": false,
            "files": files,
        }),
    };

    let response = request
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("no se pudo subir la copia: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("GitHub rechazó la copia ({status}): {text}"));
    }

    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    let hosts = content_hosts(content);
    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    Ok(SyncOutcome {
        provider: "github".to_string(),
        action: action.to_string(),
        hosts,
        destination: if existing.is_some() {
            destination
        } else if id.is_empty() {
            destination
        } else {
            format!("https://gist.github.com/{id}")
        },
    })
}

/// Descarga la copia.
pub async fn pull_gist(
    client: &reqwest::Client,
    token: &str,
) -> Result<Backup, String> {
    let Some(id) = find_gist(client, token).await? else {
        return Err("todavía no hay ninguna copia en tu cuenta de GitHub".to_string());
    };

    let response = github_headers(client.get(format!("{GISTS_URL}/{id}")), token)
        .send()
        .await
        .map_err(|err| format!("no se pudo descargar la copia: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub devolvió {}", response.status()));
    }

    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    let file = value
        .get("files")
        .and_then(|files| files.get(FILE_NAME))
        .ok_or_else(|| "el gist no contenía la copia de CloudTerm".to_string())?;

    // GitHub recorta el contenido de los ficheros grandes: en ese caso hay que
    // ir a por el contenido en crudo.
    let truncated = file
        .get("truncated")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let content = if truncated {
        let raw_url = file
            .get("raw_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "la copia está recortada y no traía enlace al original".to_string())?;
        client
            .get(raw_url)
            .send()
            .await
            .map_err(|err| format!("no se pudo descargar la copia completa: {err}"))?
            .text()
            .await
            .map_err(|err| format!("respuesta ilegible al descargar la copia: {err}"))?
    } else {
        file.get("content")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };

    parse(&content)
}

fn content_hosts(content: &str) -> usize {
    parse(content).map(|b| b.hosts.len()).unwrap_or(0)
}

/// Extrae la lista de hosts de una copia, para poder restaurarla.
pub fn hosts_of(backup: &Backup) -> &[serde_json::Value] {
    &backup.hosts
}

/* -------------------------------------------------------------------------- */
/* Google: fichero en appDataFolder                                           */
/* -------------------------------------------------------------------------- */

fn google_headers(request: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    request.bearer_auth(token)
}

/// Identificador del fichero de copia en la carpeta privada de la aplicación.
pub async fn find_drive_file(
    client: &reqwest::Client,
    token: &str,
) -> Result<Option<String>, String> {
    let response = google_headers(client.get(DRIVE_FILES_URL), token)
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", &format!("name='{FILE_NAME}'")),
            ("fields", "files(id,name,modifiedTime)"),
        ])
        .send()
        .await
        .map_err(|err| format!("no se pudo buscar la copia en Drive: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Drive devolvió {status}: {text}"));
    }

    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de Drive: {err}"))?;

    Ok(value
        .get("files")
        .and_then(|files| files.as_array())
        .and_then(|files| files.first())
        .and_then(|file| file.get("id"))
        .and_then(|id| id.as_str())
        .map(str::to_string))
}

/// Sube la copia a `appDataFolder`.
///
/// Se hace en dos pasos —crear el fichero vacío y luego subir el contenido— para
/// no tener que construir un cuerpo `multipart` a mano.
pub async fn push_drive(
    client: &reqwest::Client,
    token: &str,
    content: &str,
) -> Result<SyncOutcome, String> {
    let existing = find_drive_file(client, token).await?;

    let file_id = match existing {
        Some(id) => id,
        None => {
            let response = google_headers(client.post(DRIVE_FILES_URL), token)
                .query(&[("fields", "id")])
                .json(&serde_json::json!({
                    "name": FILE_NAME,
                    "parents": ["appDataFolder"],
                }))
                .send()
                .await
                .map_err(|err| format!("no se pudo crear el fichero en Drive: {err}"))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(format!("Drive rechazó crear el fichero ({status}): {text}"));
            }

            let value: serde_json::Value = response
                .json()
                .await
                .map_err(|err| format!("respuesta ilegible de Drive: {err}"))?;

            value
                .get("id")
                .and_then(|id| id.as_str())
                .ok_or_else(|| "Drive no devolvió el identificador del fichero".to_string())?
                .to_string()
        }
    };

    let response = google_headers(
        client.patch(format!("{DRIVE_UPLOAD_URL}/{file_id}")),
        token,
    )
    .query(&[("uploadType", "media")])
    .header("Content-Type", "application/json")
    .body(content.to_string())
    .send()
    .await
    .map_err(|err| format!("no se pudo subir la copia a Drive: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Drive rechazó la copia ({status}): {text}"));
    }

    Ok(SyncOutcome {
        provider: "google".to_string(),
        action: "guardada".to_string(),
        hosts: content_hosts(content),
        destination: "carpeta privada de la aplicación en Drive".to_string(),
    })
}

/// Descarga la copia de `appDataFolder`.
pub async fn pull_drive(client: &reqwest::Client, token: &str) -> Result<Backup, String> {
    let Some(id) = find_drive_file(client, token).await? else {
        return Err("todavía no hay ninguna copia en tu cuenta de Google".to_string());
    };

    let response = google_headers(client.get(format!("{DRIVE_FILES_URL}/{id}")), token)
        .query(&[("alt", "media")])
        .send()
        .await
        .map_err(|err| format!("no se pudo descargar la copia: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Drive devolvió {}", response.status()));
    }

    let content = response
        .text()
        .await
        .map_err(|err| format!("respuesta ilegible al descargar la copia: {err}"))?;

    parse(&content)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> (Vec<serde_json::Value>, serde_json::Value) {
        (
            vec![serde_json::json!({"id": "h1", "name": "servidor-de-prueba"})],
            serde_json::json!({"theme": "dark-neon"}),
        )
    }

    #[test]
    fn a_backup_round_trips() {
        let (hosts, settings) = sample();
        let raw = build(hosts.clone(), settings.clone()).expect("empaquetar");

        let backup = parse(&raw).expect("desempaquetar");
        assert_eq!(backup.version, FORMAT_VERSION);
        assert_eq!(backup.hosts.len(), 1);
        assert_eq!(backup.hosts[0]["name"], "servidor-de-prueba");
        assert_eq!(backup.settings["theme"], "dark-neon");
        assert!(backup.exported_at > 0);
    }

    #[test]
    fn rubbish_is_rejected() {
        assert!(parse("no soy json").is_err());
    }

    /// Una copia de una versión futura no se debe interpretar a ciegas.
    #[test]
    fn a_newer_format_is_rejected() {
        let raw = format!(
            r#"{{"version": {}, "exportedAt": 1, "hosts": [], "settings": null}}"#,
            FORMAT_VERSION + 1
        );
        let err = parse(&raw).unwrap_err();
        assert!(err.contains("más nueva"), "{err}");
    }

    #[test]
    fn the_settings_field_is_optional() {
        let raw = format!(
            r#"{{"version": {FORMAT_VERSION}, "exportedAt": 1, "hosts": []}}"#
        );
        let backup = parse(&raw).expect("debería aceptarlo");
        assert!(backup.settings.is_null());
    }

    #[test]
    fn finds_the_gist_that_holds_the_backup() {
        let gists = serde_json::json!([
            {"id": "otro", "files": {"notas.md": {}}},
            {"id": "el-bueno", "files": {FILE_NAME: {"content": "{}"}}}
        ]);
        assert_eq!(
            gist_id_from(gists.as_array().unwrap()),
            Some("el-bueno".to_string())
        );
    }

    #[test]
    fn no_backup_gist_gives_none() {
        let gists = serde_json::json!([{"id": "x", "files": {"notas.md": {}}}]);
        assert_eq!(gist_id_from(gists.as_array().unwrap()), None);
        assert_eq!(gist_id_from(&[]), None);
    }
}
