// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Comprobación de actualizaciones contra las publicaciones de GitHub.
//!
//! No descarga ni instala nada por su cuenta: pregunta cuál es la última versión
//! publicada, la compara con la que está en marcha y, si hay una nueva, ofrece
//! abrir la página de descarga. Actualizar es una decisión del usuario, no algo
//! que ocurra por detrás.

use serde::Serialize;

/// Repositorio del que se leen las publicaciones.
const REPOSITORIO: &str = "pilahito/cloudterm";

/// Endpoint de la última publicación.
const API: &str = "https://api.github.com/repos/pilahito/cloudterm/releases/latest";

/// Versión que está en marcha, tomada del propio paquete.
pub fn version_actual() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Una versión en sus tres números.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version(u32, u32, u32);

impl Version {
    /// Interpreta `v1.2.3`, `1.2.3`, `1.2` o `1`.
    ///
    /// Se ignoran los sufijos de preestreno (`-beta.1`), que no cambian el
    /// orden entre versiones estables.
    pub fn interpretar(texto: &str) -> Option<Self> {
        let limpio = texto.trim().trim_start_matches(['v', 'V']);
        let base = limpio.split(['-', '+']).next().unwrap_or(limpio);

        let mut partes = base.split('.').map(|p| p.trim().parse::<u32>().ok());
        let mayor = partes.next().flatten()?;
        let menor = partes.next().flatten().unwrap_or(0);
        let parche = partes.next().flatten().unwrap_or(0);

        Some(Version(mayor, menor, parche))
    }
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.0, self.1, self.2)
    }
}

/// Lo que se le enseña al usuario.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoActualizacion {
    /// Versión instalada.
    pub actual: String,
    /// Última publicada, si se pudo averiguar.
    pub ultima: Option<String>,
    /// Hay una versión más nueva.
    pub hay_nueva: bool,
    /// Página de la publicación.
    pub url: Option<String>,
    /// Enlace directo al instalador de esta plataforma, si lo hay.
    pub descarga: Option<String>,
    /// Notas de la publicación.
    pub notas: Option<String>,
    /// Cuándo se publicó, en texto tal cual lo da GitHub.
    pub publicada: Option<String>,
    /// Por qué no se pudo comprobar, si fue así.
    pub aviso: Option<String>,
}

impl InfoActualizacion {
    fn sin_comprobar(aviso: String) -> Self {
        Self {
            actual: version_actual().to_string(),
            ultima: None,
            hay_nueva: false,
            url: None,
            descarga: None,
            notas: None,
            publicada: None,
            aviso: Some(aviso),
        }
    }
}

/// Elige el instalador que corresponde a este sistema.
///
/// Se busca por el nombre del fichero, que es como los nombra el flujo de
/// compilación (`tauri-action`).
pub fn elegir_descarga(activos: &[serde_json::Value]) -> Option<String> {
    let objetivo = if cfg!(windows) {
        [".msi", ".exe"].as_slice()
    } else if cfg!(target_os = "macos") {
        [".dmg", ".app.tar.gz"].as_slice()
    } else {
        [".appimage", ".deb", ".rpm"].as_slice()
    };

    for extension in objetivo {
        let encontrado = activos.iter().find(|activo| {
            activo
                .get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.to_ascii_lowercase().ends_with(extension))
                .unwrap_or(false)
        });
        if let Some(url) = encontrado
            .and_then(|activo| activo.get("browser_download_url"))
            .and_then(|u| u.as_str())
        {
            return Some(url.to_string());
        }
    }
    None
}

/// Compara la versión instalada con la publicada.
pub fn analizar(cuerpo: &str, actual: &str) -> Result<InfoActualizacion, String> {
    let valor: serde_json::Value = serde_json::from_str(cuerpo)
        .map_err(|err| format!("respuesta ilegible de GitHub: {err}"))?;

    if let Some(mensaje) = valor.get("message").and_then(|m| m.as_str()) {
        // GitHub contesta 404 con `message` cuando no hay publicaciones.
        return Err(format!("GitHub respondió: {mensaje}"));
    }

    let etiqueta = valor
        .get("tag_name")
        .and_then(|t| t.as_str())
        .ok_or_else(|| "la publicación no traía etiqueta de versión".to_string())?;

    let activos = valor
        .get("assets")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();

    let ultima = Version::interpretar(etiqueta);
    let instalada = Version::interpretar(actual);
    let hay_nueva = match (ultima, instalada) {
        (Some(nueva), Some(instalada)) => nueva > instalada,
        _ => false,
    };

    Ok(InfoActualizacion {
        actual: actual.to_string(),
        ultima: ultima.map(|v| v.to_string()).or_else(|| Some(etiqueta.to_string())),
        hay_nueva,
        url: valor
            .get("html_url")
            .and_then(|u| u.as_str())
            .map(str::to_string),
        descarga: elegir_descarga(&activos),
        notas: valor
            .get("body")
            .and_then(|b| b.as_str())
            .map(str::to_string),
        publicada: valor
            .get("published_at")
            .and_then(|p| p.as_str())
            .map(str::to_string),
        aviso: None,
    })
}

/// Pregunta a GitHub cuál es la última versión publicada.
#[tauri::command]
pub async fn comprobar_actualizacion() -> InfoActualizacion {
    let cliente = match reqwest::Client::builder()
        .user_agent("CloudTerm")
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(cliente) => cliente,
        Err(err) => {
            return InfoActualizacion::sin_comprobar(format!(
                "no se pudo preparar la consulta: {err}"
            ))
        }
    };

    let respuesta = match cliente
        .get(API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(respuesta) => respuesta,
        Err(err) => {
            return InfoActualizacion::sin_comprobar(format!(
                "no se pudo conectar con GitHub: {err}"
            ))
        }
    };

    // Sin publicaciones todavía no es un error: es que aún no hay nada que
    // actualizar.
    if respuesta.status() == reqwest::StatusCode::NOT_FOUND {
        return InfoActualizacion {
            actual: version_actual().to_string(),
            ultima: None,
            hay_nueva: false,
            url: None,
            descarga: None,
            notas: None,
            publicada: None,
            aviso: Some(format!("«{REPOSITORIO}» todavía no tiene ninguna publicación")),
        };
    }

    if !respuesta.status().is_success() {
        return InfoActualizacion::sin_comprobar(format!(
            "GitHub devolvió {}",
            respuesta.status()
        ));
    }

    let cuerpo = match respuesta.text().await {
        Ok(cuerpo) => cuerpo,
        Err(err) => {
            return InfoActualizacion::sin_comprobar(format!("respuesta ilegible: {err}"))
        }
    };

    match analizar(&cuerpo, version_actual()) {
        Ok(info) => info,
        Err(err) => InfoActualizacion::sin_comprobar(err),
    }
}

/// Repositorio, para poder enseñarlo en la interfaz.
#[tauri::command]
pub fn repositorio() -> String {
    REPOSITORIO.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_parsed_with_and_without_the_v() {
        assert_eq!(Version::interpretar("v1.2.3"), Some(Version(1, 2, 3)));
        assert_eq!(Version::interpretar("1.2.3"), Some(Version(1, 2, 3)));
        assert_eq!(Version::interpretar("  v2.0  "), Some(Version(2, 0, 0)));
        assert_eq!(Version::interpretar("3"), Some(Version(3, 0, 0)));
        // Los sufijos de preestreno no cambian el orden.
        assert_eq!(Version::interpretar("v1.2.3-beta.1"), Some(Version(1, 2, 3)));
    }

    #[test]
    fn rubbish_versions_are_rejected() {
        assert_eq!(Version::interpretar(""), None);
        assert_eq!(Version::interpretar("v"), None);
        assert_eq!(Version::interpretar("no-es-una-version"), None);
    }

    /// Lo que importa: 1.10.0 es más nueva que 1.9.0, aunque como texto no lo
    /// parezca.
    #[test]
    fn versions_are_ordered_by_number_not_by_text() {
        assert!(Version(1, 10, 0) > Version(1, 9, 0));
        assert!(Version(2, 0, 0) > Version(1, 99, 99));
        assert!(Version(1, 0, 1) > Version(1, 0, 0));
        assert!(!(Version(1, 0, 0) > Version(1, 0, 0)));
    }

    #[test]
    fn a_newer_release_is_detected() {
        let cuerpo = r#"{
            "tag_name": "v1.1.0",
            "html_url": "https://github.com/pilahito/cloudterm/releases/tag/v1.1.0",
            "body": "Novedades",
            "published_at": "2026-10-01T10:00:00Z",
            "assets": []
        }"#;
        let info = analizar(cuerpo, "1.0.0").expect("debería analizarlo");
        assert!(info.hay_nueva);
        assert_eq!(info.actual, "1.0.0");
        assert_eq!(info.ultima.as_deref(), Some("1.1.0"));
        assert_eq!(info.notas.as_deref(), Some("Novedades"));
    }

    #[test]
    fn the_same_version_is_not_an_update() {
        let cuerpo = r#"{"tag_name": "v1.0.0", "assets": []}"#;
        let info = analizar(cuerpo, "1.0.0").expect("debería analizarlo");
        assert!(!info.hay_nueva);
    }

    /// Una publicación más antigua que lo instalado (por ejemplo, una copia de
    /// desarrollo) no debe ofrecer «actualizar» hacia atrás.
    #[test]
    fn an_older_release_is_not_an_update() {
        let cuerpo = r#"{"tag_name": "v0.9.0", "assets": []}"#;
        let info = analizar(cuerpo, "1.0.0").expect("debería analizarlo");
        assert!(!info.hay_nueva);
    }

    #[test]
    fn a_github_error_is_reported() {
        let err = analizar(r#"{"message": "Not Found"}"#, "1.0.0").unwrap_err();
        assert!(err.contains("Not Found"), "{err}");
    }

    #[test]
    fn a_release_without_a_tag_is_reported() {
        assert!(analizar(r#"{"assets": []}"#, "1.0.0").is_err());
    }

    #[test]
    fn the_download_for_this_system_is_picked() {
        let activos = serde_json::json!([
            {"name": "CloudTerm_1.1.0_x64.msi", "browser_download_url": "https://x/a.msi"},
            {"name": "CloudTerm_1.1.0_amd64.AppImage", "browser_download_url": "https://x/b.AppImage"},
            {"name": "CloudTerm_1.1.0_x64.dmg", "browser_download_url": "https://x/c.dmg"},
            {"name": "CloudTerm_1.1.0_amd64.deb", "browser_download_url": "https://x/d.deb"}
        ]);
        let elegido = elegir_descarga(activos.as_array().unwrap()).expect("alguno");

        // En Linux debe preferir el AppImage; en Windows, el .msi; en macOS, el .dmg.
        if cfg!(windows) {
            assert!(elegido.ends_with(".msi"), "{elegido}");
        } else if cfg!(target_os = "macos") {
            assert!(elegido.ends_with(".dmg"), "{elegido}");
        } else {
            assert!(elegido.ends_with(".AppImage"), "{elegido}");
        }
    }

    #[test]
    fn no_assets_means_no_download_link() {
        assert_eq!(elegir_descarga(&[]), None);
        let solo_texto = serde_json::json!([{"name": "notas.txt"}]);
        assert_eq!(elegir_descarga(solo_texto.as_array().unwrap()), None);
    }
}
