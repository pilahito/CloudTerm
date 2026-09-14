// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Idiomas instalados por el usuario.
//!
//! Los tres idiomas que vienen con CloudTerm son del proyecto. Cualquiera puede
//! traducir a otro idioma y **dejar su fichero** en la carpeta de idiomas, sin
//! recompilar nada.
//!
//! Eso tiene una consecuencia que conviene no esconder: un fichero de idioma es
//! código que acaba pintándose en la interfaz, y no lo ha escrito el creador de
//! CloudTerm. Cuando se elige uno de esos, la aplicación **avisa antes de
//! usarlo**, diciendo quién lo firma. Aquí solo se leen y se describen; quien
//! decide es el usuario.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Subcarpeta, dentro de la configuración, donde se dejan los idiomas.
const CARPETA: &str = "idiomas";

/// Autor que se considera el del proyecto.
pub const AUTOR_OFICIAL: &str = "DavidPilahito7";

/// Un idioma instalado por el usuario.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdiomaExterno {
    /// Código, tomado del nombre del fichero (`de.json` → `de`).
    pub id: String,
    /// Nombre para el selector; si no lo indica el fichero, el propio código.
    pub nombre: String,
    /// Quién firma la traducción.
    pub autor: String,
    /// Lo firma el autor del proyecto.
    pub oficial: bool,
    /// Cuántas claves trae.
    pub claves: usize,
    /// Ruta del fichero, para poder enseñarla.
    pub ruta: String,
    /// Algo va mal con este fichero y no se debería cargar.
    pub aviso: Option<String>,
    /// El diccionario ya leído, listo para la interfaz.
    pub diccionario: std::collections::BTreeMap<String, String>,
}

/// Carpeta de idiomas, creándola si no existe.
pub fn carpeta(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?
        .join(CARPETA);

    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;

    Ok(dir)
}

/// Describe un fichero de idioma ya leído.
///
/// `id` viene del nombre del fichero. Si al fichero le falta la firma, se marca
/// como no oficial y se dice por qué: es justo el caso en el que hay que avisar.
pub fn describir(id: &str, ruta: &Path, contenido: &str) -> Result<IdiomaExterno, String> {
    let bruto: serde_json::Value = serde_json::from_str(contenido)
        .map_err(|err| format!("no es JSON válido: {err}"))?;

    let objeto = bruto
        .as_object()
        .ok_or_else(|| "el fichero debe ser un objeto de clave → texto".to_string())?;

    let mut diccionario = std::collections::BTreeMap::new();
    for (clave, valor) in objeto {
        // Las claves `_meta.*` describen el fichero, no son textos de interfaz.
        if clave.starts_with("_meta.") {
            continue;
        }
        if let Some(texto) = valor.as_str() {
            diccionario.insert(clave.clone(), texto.to_string());
        }
    }

    let leer = |clave: &str| {
        objeto
            .get(clave)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .trim()
            .to_string()
    };

    let autor = leer("_meta.author");
    let oficial = leer("_meta.official").eq_ignore_ascii_case("true")
        || autor.eq_ignore_ascii_case(AUTOR_OFICIAL);
    let nombre = {
        let declarado = leer("_meta.name");
        if declarado.is_empty() {
            id.to_string()
        } else {
            declarado
        }
    };

    let aviso = if diccionario.is_empty() {
        Some("el fichero no trae ninguna clave".to_string())
    } else if autor.is_empty() {
        Some("el fichero no dice quién lo ha traducido".to_string())
    } else if !oficial {
        // No es un error: es exactamente el caso que hay que avisar.
        Some(format!(
            "lo ha traducido «{autor}», que no es el autor de CloudTerm"
        ))
    } else {
        None
    };

    Ok(IdiomaExterno {
        id: id.to_string(),
        nombre,
        autor,
        oficial,
        claves: diccionario.len(),
        ruta: ruta.to_string_lossy().to_string(),
        aviso,
        diccionario,
    })
}

/// Idiomas instalados en la carpeta de configuración.
///
/// Un fichero mal formado no se descarta en silencio: se devuelve con su aviso,
/// para que el usuario sepa que está ahí y por qué no sirve.
pub fn listar_en(carpeta: &Path) -> Vec<IdiomaExterno> {
    let Ok(entradas) = std::fs::read_dir(carpeta) else {
        return Vec::new();
    };

    let mut idiomas: Vec<IdiomaExterno> = entradas
        .filter_map(|entrada| entrada.ok())
        .map(|entrada| entrada.path())
        .filter(|ruta| {
            ruta.is_file() && ruta.extension().map(|e| e == "json").unwrap_or(false)
        })
        .filter_map(|ruta| {
            let id = ruta.file_stem()?.to_string_lossy().to_string();
            // Los idiomas que ya vienen con la aplicación no se pueden pisar
            // desde aquí: se ignoran sin más.
            if ["es", "en", "zh"].contains(&id.as_str()) {
                return None;
            }

            match std::fs::read_to_string(&ruta) {
                Ok(contenido) => match describir(&id, &ruta, &contenido) {
                    Ok(idioma) => Some(idioma),
                    Err(err) => Some(IdiomaExterno {
                        id,
                        nombre: String::new(),
                        autor: String::new(),
                        oficial: false,
                        claves: 0,
                        ruta: ruta.to_string_lossy().to_string(),
                        aviso: Some(err),
                        diccionario: Default::default(),
                    }),
                },
                Err(err) => Some(IdiomaExterno {
                    id,
                    nombre: String::new(),
                    autor: String::new(),
                    oficial: false,
                    claves: 0,
                    ruta: ruta.to_string_lossy().to_string(),
                    aviso: Some(format!("no se pudo leer: {err}")),
                    diccionario: Default::default(),
                }),
            }
        })
        .collect();

    idiomas.sort_by(|a, b| a.id.cmp(&b.id));
    idiomas
}

/// Idiomas instalados por el usuario.
#[tauri::command]
pub fn idiomas_externos(app: AppHandle) -> Result<Vec<IdiomaExterno>, String> {
    Ok(listar_en(&carpeta(&app)?))
}

/// Ruta de la carpeta de idiomas, para poder abrirla.
#[tauri::command]
pub fn idiomas_carpeta(app: AppHandle) -> Result<String, String> {
    Ok(carpeta(&app)?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ruta_falsa(id: &str) -> PathBuf {
        PathBuf::from(format!("/tmp/cloudterm-idiomas/{id}.json"))
    }

    #[test]
    fn a_locale_from_the_project_is_official() {
        let contenido = r#"{
            "_meta.author": "DavidPilahito7",
            "_meta.official": "true",
            "_meta.name": "Deutsch",
            "common.cancel": "Abbrechen"
        }"#;
        let idioma = describir("de", &ruta_falsa("de"), contenido).expect("debería describirlo");

        assert!(idioma.oficial);
        assert_eq!(idioma.autor, "DavidPilahito7");
        assert_eq!(idioma.nombre, "Deutsch");
        assert_eq!(idioma.claves, 1);
        assert!(idioma.aviso.is_none());
    }

    /// El caso que importa: una traducción de otra persona se marca y se explica
    /// por qué, en vez de cargarse a ciegas.
    #[test]
    fn a_third_party_locale_is_flagged() {
        let contenido = r#"{
            "_meta.author": "OtraPersona",
            "_meta.name": "Deutsch",
            "common.cancel": "Abbrechen"
        }"#;
        let idioma = describir("de", &ruta_falsa("de"), contenido).expect("debería describirlo");

        assert!(!idioma.oficial);
        assert_eq!(idioma.autor, "OtraPersona");
        let aviso = idioma.aviso.expect("debería avisar");
        assert!(aviso.contains("OtraPersona"), "{aviso}");
        assert!(aviso.contains("no es el autor"), "{aviso}");
    }

    #[test]
    fn a_locale_without_a_signature_is_flagged() {
        let idioma = describir("de", &ruta_falsa("de"), r#"{"common.cancel": "Abbrechen"}"#)
            .expect("debería describirlo");

        assert!(!idioma.oficial);
        assert!(idioma.aviso.is_some());
        // Sin nombre declarado, se usa el código.
        assert_eq!(idioma.nombre, "de");
    }

    #[test]
    fn a_locale_without_keys_is_flagged() {
        let idioma = describir(
            "de",
            &ruta_falsa("de"),
            r#"{"_meta.author": "Alguien"}"#,
        )
        .expect("debería describirlo");

        assert_eq!(idioma.claves, 0);
        assert!(idioma.aviso.unwrap().contains("ninguna clave"));
    }

    #[test]
    fn metadata_keys_are_not_part_of_the_dictionary() {
        let contenido = r#"{
            "_meta.author": "DavidPilahito7",
            "_meta.official": "true",
            "_meta.name": "Deutsch",
            "common.cancel": "Abbrechen"
        }"#;
        let idioma = describir("de", &ruta_falsa("de"), contenido).expect("debería describirlo");

        assert!(!idioma.diccionario.contains_key("_meta.author"));
        assert_eq!(
            idioma.diccionario.get("common.cancel").map(String::as_str),
            Some("Abbrechen")
        );
    }

    #[test]
    fn broken_json_is_reported_instead_of_panicking() {
        assert!(describir("de", &ruta_falsa("de"), "no soy json").is_err());
        assert!(describir("de", &ruta_falsa("de"), "[1, 2, 3]").is_err());
    }

    #[test]
    fn the_official_author_marks_it_official_even_without_the_flag() {
        let contenido = r#"{"_meta.author": "DavidPilahito7", "common.cancel": "x"}"#;
        let idioma = describir("de", &ruta_falsa("de"), contenido).expect("debería describirlo");
        assert!(idioma.oficial);
    }

    #[test]
    fn bundled_languages_cannot_be_replaced_from_the_folder() {
        let dir = std::env::temp_dir().join("cloudterm-idiomas-prueba");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("carpeta");

        std::fs::write(dir.join("es.json"), r#"{"_meta.author":"Falso"}"#).expect("escribir");
        std::fs::write(
            dir.join("de.json"),
            r#"{"_meta.author":"Otra","common.cancel":"Abbrechen"}"#,
        )
        .expect("escribir");
        std::fs::write(dir.join("notas.txt"), "no es un idioma").expect("escribir");

        let idiomas = listar_en(&dir);

        // `es` se ignora porque viene con la aplicación, y el .txt no es JSON.
        assert_eq!(idiomas.len(), 1, "{:?}", idiomas.iter().map(|i| &i.id).collect::<Vec<_>>());
        assert_eq!(idiomas[0].id, "de");
        assert!(!idiomas[0].oficial);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
