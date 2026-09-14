// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Dónde se guarda la copia de seguridad.
//!
//! Al principio solo había dos sitios —un gist de GitHub y la carpeta privada de
//! Drive—, y eso obligaba a tener cuenta en uno de los dos. Ahora se puede
//! elegir:
//!
//! | Destino | Para quién |
//! | --- | --- |
//! | **Carpeta** | Cualquier nube con cliente de escritorio (Dropbox, OneDrive, Mega…) y cualquier disco |
//! | **WebDAV** | Nextcloud, ownCloud, Synology, Box… y servidores propios |
//! | **SFTP** | Tu propio servidor, reutilizando la sesión SSH de CloudTerm |
//! | **GitHub** / **Google** | Gist secreto y carpeta privada de Drive |
//!
//! La carpeta es la opción más socorrida: si tu nube sincroniza una carpeta,
//! apúntale CloudTerm y ya está. No hace falta que sepa nada de ese servicio.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::ssh::client::{self, SessionParams};
use crate::ssh::SshAuth;

/// Nombre del fichero de copia, igual en todos los destinos.
pub const FICHERO: &str = "cloudterm-backup.json";

/// Fichero donde vive la configuración de destinos.
const CONFIG: &str = "destinos.json";

/* -------------------------------------------------------------------------- */
/* Modelos                                                                    */
/* -------------------------------------------------------------------------- */

/// Destino de la copia.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Destino {
    /// Una carpeta del equipo; sirve para cualquier nube con cliente propio.
    Carpeta,
    /// Un servidor WebDAV.
    Webdav,
    /// Un servidor propio por SSH.
    Sftp,
    /// Gist secreto.
    Github,
    /// Carpeta privada de Drive.
    Google,
}

impl Destino {
    /// ¿Necesita una sesión de Google o GitHub?
    pub fn necesita_sesion(self) -> bool {
        matches!(self, Destino::Github | Destino::Google)
    }
}

/// Servidor WebDAV.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Webdav {
    /// URL base, por ejemplo `https://nube.example.com/remote.php/dav/files/usuario`.
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub usuario: String,
    #[serde(default)]
    pub contrasena: String,
}

/// Servidor propio por SSH.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sftp {
    #[serde(default)]
    pub host: String,
    #[serde(default = "puerto_por_defecto")]
    pub puerto: u16,
    #[serde(default)]
    pub usuario: String,
    #[serde(default)]
    pub contrasena: String,
    /// Carpeta remota. Vacío significa «mi carpeta personal».
    #[serde(default)]
    pub ruta: String,
}

impl Default for Sftp {
    fn default() -> Self {
        Self {
            host: String::new(),
            puerto: puerto_por_defecto(),
            usuario: String::new(),
            contrasena: String::new(),
            ruta: String::new(),
        }
    }
}

fn puerto_por_defecto() -> u16 {
    22
}

/// Todo lo que hace falta para saber dónde va la copia.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDestinos {
    pub activo: Destino,
    #[serde(default)]
    pub carpeta: String,
    #[serde(default)]
    pub webdav: Webdav,
    #[serde(default)]
    pub sftp: Sftp,
}

impl Default for ConfigDestinos {
    fn default() -> Self {
        Self {
            // La carpeta es el destino por defecto: no pide cuenta en ningún
            // sitio y funciona con cualquier nube que sincronice.
            activo: Destino::Carpeta,
            carpeta: String::new(),
            webdav: Webdav::default(),
            sftp: Sftp::default(),
        }
    }
}

impl ConfigDestinos {
    /// Comprueba que el destino elegido tiene lo que necesita.
    pub fn revisar(&self) -> Result<(), String> {
        match self.activo {
            Destino::Carpeta => {
                if self.carpeta.trim().is_empty() {
                    return Err("indica una carpeta para la copia".to_string());
                }
                Ok(())
            }
            Destino::Webdav => {
                let url = self.webdav.url.trim();
                if url.is_empty() {
                    return Err("indica la dirección del servidor WebDAV".to_string());
                }
                if !url.starts_with("http://") && !url.starts_with("https://") {
                    return Err("la dirección WebDAV debe empezar por http:// o https://".to_string());
                }
                Ok(())
            }
            Destino::Sftp => {
                if self.sftp.host.trim().is_empty() {
                    return Err("indica el servidor para la copia".to_string());
                }
                if self.sftp.usuario.trim().is_empty() {
                    return Err("indica el usuario del servidor".to_string());
                }
                Ok(())
            }
            Destino::Github | Destino::Google => Ok(()),
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Almacenamiento                                                             */
/* -------------------------------------------------------------------------- */

fn ruta_config(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
    Ok(dir.join(CONFIG))
}

/// Lee la configuración; si no hay ninguna, devuelve la de por defecto.
pub fn leer(app: &AppHandle) -> ConfigDestinos {
    ruta_config(app)
        .ok()
        .and_then(|ruta| std::fs::read_to_string(ruta).ok())
        .and_then(|bruto| serde_json::from_str(&bruto).ok())
        .unwrap_or_default()
}

/// Guarda la configuración con permisos de solo el dueño.
///
/// Dentro van contraseñas de WebDAV y de SFTP, así que el fichero se escribe
/// como el de seguridad: `0600`.
pub fn escribir(app: &AppHandle, config: &ConfigDestinos) -> Result<(), String> {
    let destino = ruta_config(app)?;
    let cuerpo = serde_json::to_string_pretty(config)
        .map_err(|err| format!("no se pudo serializar: {err}"))?;

    let temporal = destino.with_extension("tmp");
    std::fs::write(&temporal, cuerpo)
        .map_err(|err| format!("no se pudo escribir {}: {err}", temporal.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporal, std::fs::Permissions::from_mode(0o600));
    }

    std::fs::rename(&temporal, &destino)
        .map_err(|err| format!("no se pudo reemplazar {}: {err}", destino.display()))
}

/* -------------------------------------------------------------------------- */
/* Carpeta                                                                    */
/* -------------------------------------------------------------------------- */

/// Ruta del fichero de copia dentro de una carpeta.
pub fn ruta_copia(carpeta: &str) -> PathBuf {
    PathBuf::from(shellexpand(carpeta)).join(FICHERO)
}

/// Expande `~` y las variables de entorno habituales.
///
/// Se repite aquí en pequeño para no arrastrar todo el módulo de SSH hasta un
/// sitio que solo necesita resolver una carpeta.
pub fn shellexpand(ruta: &str) -> String {
    let recortada = ruta.trim();
    let hogar = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();

    if let Some(hogar) = hogar {
        if recortada == "~" {
            return hogar;
        }
        for prefijo in ["~/", "~\\"] {
            if let Some(resto) = recortada.strip_prefix(prefijo) {
                return format!("{hogar}/{resto}");
            }
        }
    }
    recortada.to_string()
}

fn subir_carpeta(config: &ConfigDestinos, contenido: &str) -> Result<String, String> {
    let destino = ruta_copia(&config.carpeta);
    if let Some(padre) = destino.parent() {
        std::fs::create_dir_all(padre)
            .map_err(|err| format!("no se pudo crear {}: {err}", padre.display()))?;
    }
    std::fs::write(&destino, contenido)
        .map_err(|err| format!("no se pudo escribir {}: {err}", destino.display()))?;
    Ok(destino.to_string_lossy().to_string())
}

fn bajar_carpeta(config: &ConfigDestinos) -> Result<String, String> {
    let destino = ruta_copia(&config.carpeta);
    std::fs::read_to_string(&destino)
        .map_err(|err| format!("no se pudo leer {}: {err}", destino.display()))
}

/* -------------------------------------------------------------------------- */
/* WebDAV                                                                     */
/* -------------------------------------------------------------------------- */

/// URL del fichero, uniendo la base con el nombre sin duplicar la barra.
pub fn url_webdav(base: &str, fichero: &str) -> String {
    format!("{}/{}", base.trim().trim_end_matches('/'), fichero)
}

async fn subir_webdav(config: &ConfigDestinos, contenido: &str) -> Result<String, String> {
    let url = url_webdav(&config.webdav.url, FICHERO);
    let cliente = reqwest::Client::new();

    let respuesta = cliente
        .put(&url)
        .basic_auth(&config.webdav.usuario, Some(&config.webdav.contrasena))
        .header("Content-Type", "application/json")
        .body(contenido.to_string())
        .send()
        .await
        .map_err(|err| format!("no se pudo subir a WebDAV: {err}"))?;

    if !respuesta.status().is_success() {
        // Sin el código a la vista, un 401 y un 507 se confunden.
        return Err(format!(
            "WebDAV rechazó la copia: {} {}",
            respuesta.status(),
            match respuesta.status().as_u16() {
                401 | 403 => "(usuario o contraseña incorrectos)",
                404 => "(la carpeta no existe; revisa la dirección)",
                507 => "(no queda espacio)",
                _ => "",
            }
        ));
    }

    Ok(url)
}

async fn bajar_webdav(config: &ConfigDestinos) -> Result<String, String> {
    let url = url_webdav(&config.webdav.url, FICHERO);
    let cliente = reqwest::Client::new();

    let respuesta = cliente
        .get(&url)
        .basic_auth(&config.webdav.usuario, Some(&config.webdav.contrasena))
        .send()
        .await
        .map_err(|err| format!("no se pudo leer de WebDAV: {err}"))?;

    if !respuesta.status().is_success() {
        return Err(format!("WebDAV devolvió {}", respuesta.status()));
    }

    respuesta
        .text()
        .await
        .map_err(|err| format!("respuesta ilegible de WebDAV: {err}"))
}

/* -------------------------------------------------------------------------- */
/* SFTP                                                                       */
/* -------------------------------------------------------------------------- */

/// Ruta remota del fichero de copia.
///
/// Sin ruta indicada se deja solo el nombre, que el servidor resuelve contra la
/// carpeta personal del usuario: así no hay que adivinar dónde aterriza cada
/// servidor.
pub fn ruta_remota(config: &ConfigDestinos) -> String {
    let base = config.sftp.ruta.trim().trim_end_matches('/');
    if base.is_empty() {
        FICHERO.to_string()
    } else {
        format!("{base}/{FICHERO}")
    }
}

async fn abrir_sftp(
    app: &AppHandle,
    config: &ConfigDestinos,
) -> Result<(russh::client::Handle<client::ClientHandler>, russh_sftp::client::SftpSession), String> {
    let params = SessionParams {
        host: config.sftp.host.trim().to_string(),
        port: config.sftp.puerto,
        username: config.sftp.usuario.trim().to_string(),
        auth: SshAuth::Password {
            password: config.sftp.contrasena.clone(),
        },
        term: "xterm-256color".to_string(),
        cols: 80,
        rows: 24,
        timeout: std::time::Duration::from_secs(60),
        home_dir: None,
        // Se pasa la aplicación para que la clave del servidor se verifique
        // contra el `known_hosts` de CloudTerm, igual que en una conexión normal.
        app: Some(app.clone()),
    };

    crate::ssh::client::open_sftp(&params).await
}

async fn subir_sftp(
    app: &AppHandle,
    config: &ConfigDestinos,
    contenido: &str,
) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;

    let (_handle, sesion) = abrir_sftp(app, config).await?;
    let remoto = ruta_remota(config);

    let mut fichero = sesion
        .create(&remoto)
        .await
        .map_err(|err| format!("no se pudo crear {remoto}: {err}"))?;
    fichero
        .write_all(contenido.as_bytes())
        .await
        .map_err(|err| format!("no se pudo escribir {remoto}: {err}"))?;
    // `close` espera el acuse del servidor: sin esto se perderían datos.
    fichero
        .close()
        .await
        .map_err(|err| format!("no se pudo cerrar {remoto}: {err}"))?;

    Ok(format!("{}:{remoto}", config.sftp.host.trim()))
}

async fn bajar_sftp(app: &AppHandle, config: &ConfigDestinos) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    let (_handle, sesion) = abrir_sftp(app, config).await?;
    let remoto = ruta_remota(config);

    let mut fichero = sesion
        .open(&remoto)
        .await
        .map_err(|err| format!("no se pudo abrir {remoto}: {err}"))?;

    let mut contenido = String::new();
    fichero
        .read_to_string(&mut contenido)
        .await
        .map_err(|err| format!("no se pudo leer {remoto}: {err}"))?;
    let _ = fichero.close().await;

    Ok(contenido)
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

/// Configuración actual de destinos.
#[tauri::command]
pub fn destinos_estado(app: AppHandle) -> ConfigDestinos {
    leer(&app)
}

/// Guarda la configuración de destinos.
#[tauri::command]
pub fn destinos_guardar(
    app: AppHandle,
    config: ConfigDestinos,
) -> Result<ConfigDestinos, String> {
    config.revisar()?;
    escribir(&app, &config)?;
    Ok(config)
}

/// Carpeta sugerida para la copia, cuando no hay ninguna indicada.
#[tauri::command]
pub fn destinos_carpeta_sugerida(app: AppHandle) -> String {
    app.path()
        .document_dir()
        .map(|dir| dir.join("CloudTerm").to_string_lossy().to_string())
        .unwrap_or_else(|_| "~/CloudTerm".to_string())
}

/// Comprueba el destino activo subiendo una copia de prueba y leyéndola.
///
/// Se hace el viaje completo a propósito: un servidor puede aceptar la conexión
/// y fallar al escribir, que es justo el fallo que interesa detectar.
#[tauri::command]
pub async fn destinos_probar(app: AppHandle, config: ConfigDestinos) -> Result<String, String> {
    config.revisar()?;

    if config.activo.necesita_sesion() {
        return Err(
            "este destino usa tu cuenta: se comprueba al iniciar sesión, no desde aquí".to_string(),
        );
    }

    let prueba = "{\"prueba\":true}";
    let escritura = match config.activo {
        Destino::Carpeta => subir_carpeta(&config, prueba),
        Destino::Webdav => subir_webdav(&config, prueba).await,
        Destino::Sftp => subir_sftp(&app, &config, prueba).await,
        Destino::Github | Destino::Google => unreachable!("se ha filtrado arriba"),
    }?;

    Ok(escritura)
}

/* -------------------------------------------------------------------------- */
/* Envío y recepción                                                          */
/* -------------------------------------------------------------------------- */

/// Sube la copia al destino configurado. Devuelve dónde quedó.
pub async fn subir(app: &AppHandle, contenido: &str, config: &ConfigDestinos) -> Result<String, String> {
    match config.activo {
        Destino::Carpeta => subir_carpeta(config, contenido),
        Destino::Webdav => subir_webdav(config, contenido).await,
        Destino::Sftp => subir_sftp(app, config, contenido).await,
        Destino::Github | Destino::Google => {
            Err("ese destino lo gestiona el inicio de sesión".to_string())
        }
    }
}

/// Baja la copia del destino configurado.
pub async fn bajar(app: &AppHandle, config: &ConfigDestinos) -> Result<String, String> {
    match config.activo {
        Destino::Carpeta => bajar_carpeta(config),
        Destino::Webdav => bajar_webdav(config).await,
        Destino::Sftp => bajar_sftp(app, config).await,
        Destino::Github | Destino::Google => {
            Err("ese destino lo gestiona el inicio de sesión".to_string())
        }
    }
}

/// Prepara la carpeta de la copia y devuelve su ruta, para poder abrirla.
#[tauri::command]
pub fn destinos_abrir(config: ConfigDestinos) -> Result<String, String> {
    config.revisar()?;
    let ruta = ruta_copia(&config.carpeta);
    if let Some(padre) = ruta.parent() {
        std::fs::create_dir_all(padre)
            .map_err(|err| format!("no se pudo crear {}: {err}", padre.display()))?;
    }
    Ok(Path::new(&config.carpeta).to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_folder_expands_the_home_shorthand() {
        if let Ok(hogar) = std::env::var("HOME") {
            assert_eq!(shellexpand("~/Copias"), format!("{hogar}/Copias"));
            assert_eq!(shellexpand("~"), hogar);
        }
        // Una ruta normal se deja como está.
        assert_eq!(shellexpand("/mnt/datos/x"), "/mnt/datos/x");
        assert_eq!(shellexpand("  /mnt/datos/x  "), "/mnt/datos/x");
    }

    #[test]
    fn the_backup_file_keeps_its_name() {
        let ruta = ruta_copia("/tmp/copias");
        assert!(ruta.ends_with(FICHERO));
        assert!(ruta.to_string_lossy().starts_with("/tmp/copias"));
    }

    /// El nombre del fichero es el mismo en todos los destinos: una copia hecha
    /// en uno se puede restaurar desde otro.
    #[test]
    fn every_destination_uses_the_same_file_name() {
        let config = ConfigDestinos {
            sftp: Sftp {
                ruta: "/var/copias".to_string(),
                ..Sftp::default()
            },
            ..ConfigDestinos::default()
        };
        assert_eq!(ruta_remota(&config), format!("/var/copias/{FICHERO}"));

        // Sin ruta, se deja solo el nombre y el servidor lo resuelve contra la
        // carpeta personal.
        let sin_ruta = ConfigDestinos::default();
        assert_eq!(ruta_remota(&sin_ruta), FICHERO);

        // Una barra de más no debe producir una doble barra.
        let con_barra = ConfigDestinos {
            sftp: Sftp {
                ruta: "/var/copias/".to_string(),
                ..Sftp::default()
            },
            ..ConfigDestinos::default()
        };
        assert_eq!(ruta_remota(&con_barra), format!("/var/copias/{FICHERO}"));
    }

    #[test]
    fn the_webdav_url_does_not_double_the_slash() {
        for base in [
            "https://nube.example.com/dav",
            "https://nube.example.com/dav/",
            "  https://nube.example.com/dav/  ",
        ] {
            assert_eq!(
                url_webdav(base, FICHERO),
                format!("https://nube.example.com/dav/{FICHERO}"),
                "con base {base:?}"
            );
        }
    }

    #[test]
    fn the_default_destination_is_a_folder() {
        // No pide cuenta en ningún sitio, que es lo que se espera de un valor
        // por defecto sensato.
        let config = ConfigDestinos::default();
        assert_eq!(config.activo, Destino::Carpeta);
        assert!(!config.activo.necesita_sesion());
    }

    #[test]
    fn only_the_cloud_destinations_need_a_session() {
        assert!(Destino::Github.necesita_sesion());
        assert!(Destino::Google.necesita_sesion());
        assert!(!Destino::Carpeta.necesita_sesion());
        assert!(!Destino::Webdav.necesita_sesion());
        assert!(!Destino::Sftp.necesita_sesion());
    }

    #[test]
    fn a_folder_destination_without_a_folder_is_rejected() {
        let config = ConfigDestinos::default();
        let err = config.revisar().unwrap_err();
        assert!(err.contains("carpeta"), "{err}");
    }

    #[test]
    fn a_webdav_destination_without_a_url_is_rejected() {
        let config = ConfigDestinos {
            activo: Destino::Webdav,
            ..ConfigDestinos::default()
        };
        assert!(config.revisar().is_err());

        // Y con una dirección que no es HTTP tampoco vale.
        let mala = ConfigDestinos {
            activo: Destino::Webdav,
            webdav: Webdav {
                url: "ftp://nube.example.com".to_string(),
                ..Webdav::default()
            },
            ..ConfigDestinos::default()
        };
        let err = mala.revisar().unwrap_err();
        assert!(err.contains("http"), "{err}");
    }

    #[test]
    fn a_complete_webdav_destination_is_accepted() {
        let config = ConfigDestinos {
            activo: Destino::Webdav,
            webdav: Webdav {
                url: "https://nube.example.com/dav".to_string(),
                usuario: "ana".to_string(),
                contrasena: "secreta".to_string(),
            },
            ..ConfigDestinos::default()
        };
        assert!(config.revisar().is_ok());
    }

    #[test]
    fn an_sftp_destination_needs_a_host_and_a_user() {
        let sin_host = ConfigDestinos {
            activo: Destino::Sftp,
            ..ConfigDestinos::default()
        };
        assert!(sin_host.revisar().is_err());

        let solo_host = ConfigDestinos {
            activo: Destino::Sftp,
            sftp: Sftp {
                host: "servidor.example.com".to_string(),
                ..Sftp::default()
            },
            ..ConfigDestinos::default()
        };
        let err = solo_host.revisar().unwrap_err();
        assert!(err.contains("usuario"), "{err}");

        let completo = ConfigDestinos {
            activo: Destino::Sftp,
            sftp: Sftp {
                host: "servidor.example.com".to_string(),
                usuario: "ana".to_string(),
                ..Sftp::default()
            },
            ..ConfigDestinos::default()
        };
        assert!(completo.revisar().is_ok());
    }

    #[test]
    fn the_sftp_port_defaults_to_the_standard_one() {
        assert_eq!(Sftp::default().puerto, 22);
        // Y se puede cambiar, que es el caso de un servidor con puerto propio.
        let leido: Sftp = serde_json::from_str(r#"{"host":"x","puerto":2222}"#).unwrap();
        assert_eq!(leido.puerto, 2222);
        // Si el fichero no trae puerto, se usa el estándar.
        let sin_puerto: Sftp = serde_json::from_str(r#"{"host":"x"}"#).unwrap();
        assert_eq!(sin_puerto.puerto, 22);
    }

    #[test]
    fn destinations_round_trip_through_json() {
        let config = ConfigDestinos {
            activo: Destino::Sftp,
            carpeta: "/tmp/copias".to_string(),
            webdav: Webdav {
                url: "https://x.example.com/dav".to_string(),
                usuario: "ana".to_string(),
                contrasena: "s".to_string(),
            },
            sftp: Sftp {
                host: "servidor.example.com".to_string(),
                puerto: 2222,
                usuario: "ana".to_string(),
                contrasena: "s".to_string(),
                ruta: "/var/copias".to_string(),
            },
        };

        let bruto = serde_json::to_string(&config).expect("serializar");
        let vuelta: ConfigDestinos = serde_json::from_str(&bruto).expect("deserializar");

        assert_eq!(vuelta.activo, Destino::Sftp);
        assert_eq!(vuelta.sftp.puerto, 2222);
        assert_eq!(vuelta.webdav.usuario, "ana");
        assert_eq!(vuelta.carpeta, "/tmp/copias");
    }

    /// Una configuración vieja, sin los campos nuevos, debe seguir leyéndose.
    #[test]
    fn an_old_config_without_the_new_fields_still_loads() {
        let viejo = r#"{"activo":"carpeta","carpeta":"/tmp/x"}"#;
        let config: ConfigDestinos = serde_json::from_str(viejo).expect("debería leerse");
        assert_eq!(config.activo, Destino::Carpeta);
        assert_eq!(config.sftp.puerto, 22, "el puerto debe caer al valor por defecto");
        assert!(config.webdav.url.is_empty());
    }

    #[test]
    fn a_folder_backup_round_trips_on_disk() {
        let dir = std::env::temp_dir().join("cloudterm-destino-carpeta");
        let _ = std::fs::remove_dir_all(&dir);

        let config = ConfigDestinos {
            activo: Destino::Carpeta,
            carpeta: dir.to_string_lossy().to_string(),
            ..ConfigDestinos::default()
        };

        let escrito = subir_carpeta(&config, r#"{"hola":1}"#).expect("subir");
        assert!(escrito.ends_with(FICHERO));

        let leido = bajar_carpeta(&config).expect("bajar");
        assert_eq!(leido, r#"{"hola":1}"#);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reading_a_folder_without_a_backup_says_so() {
        let config = ConfigDestinos {
            carpeta: std::env::temp_dir()
                .join("cloudterm-no-existe-12345")
                .to_string_lossy()
                .to_string(),
            ..ConfigDestinos::default()
        };
        assert!(bajar_carpeta(&config).is_err());
    }
}
