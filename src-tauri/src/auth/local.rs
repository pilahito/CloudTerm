// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Cuenta local y segundo factor.
//!
//! CloudTerm puede pedir que te identifiques antes de dejarte usar la aplicación.
//! Hay dos formas:
//!
//! - **Local**: tu nombre y tu contraseña, guardados aquí. No hace falta cuenta
//!   en ningún sitio.
//! - **Con Google o GitHub**: quien te identifica es el proveedor.
//!
//! En los dos casos el **segundo factor es obligatorio**: un código de seis
//! dígitos de tu aplicación de autenticación (Google Authenticator, Microsoft
//! Authenticator, Authy…). Es lo que pide la gente que trabaja con servidores:
//! una contraseña sola no basta.
//!
//! El fichero `seguridad.json` se escribe con permisos `0600`. El secreto del
//! segundo factor vive ahí y no en el llavero **a propósito**: en Linux el
//! llavero nativo es el del kernel, que se vacía al reiniciar, y perder ese
//! secreto dejaría al usuario fuera de su propia aplicación para siempre.

use super::totp;
use argon2::password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Fichero donde vive la configuración de seguridad.
const FICHERO: &str = "seguridad.json";

/// Cuántos códigos de recuperación se entregan.
const RECUPERACION: usize = 8;

/// Nombre que se enseña en la aplicación de autenticación.
const EMISOR: &str = "CloudTerm";

/* -------------------------------------------------------------------------- */
/* Modelos                                                                    */
/* -------------------------------------------------------------------------- */

/// Cómo se identifica el usuario.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Metodo {
    /// Nombre y contraseña guardados en este equipo.
    Local,
    /// Identifica Google.
    Google,
    /// Identifica GitHub.
    GitHub,
}

impl Metodo {
    fn clave(self) -> &'static str {
        match self {
            Metodo::Local => "local",
            Metodo::Google => "google",
            Metodo::GitHub => "github",
        }
    }
}

/// Lo que se guarda en disco.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Guardado {
    metodo: Metodo,
    #[serde(default)]
    usuario: String,
    /// Hash Argon2id de la contraseña; vacío cuando identifica un proveedor.
    #[serde(default)]
    hash: String,
    /// Secreto del segundo factor, en base32.
    secreto: String,
    /// Hashes de los códigos de recuperación ya usados o pendientes.
    #[serde(default)]
    recuperacion: Vec<String>,
    creado: i64,
}

/// Estado que ve la interfaz.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoSeguridad {
    /// Hay bloqueo configurado.
    pub configurado: bool,
    /// Método de identificación, si lo hay.
    pub metodo: Option<String>,
    /// Nombre de usuario, solo en el método local.
    pub usuario: Option<String>,
    /// Siempre `true` si hay bloqueo: el segundo factor no es opcional.
    pub segundo_factor: bool,
    /// Cuántos códigos de recuperación quedan sin usar.
    pub recuperacion_restante: usize,
}

/// Datos que se entregan al empezar el alta.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alta {
    pub secreto: String,
    pub uri: String,
    /// Código QR en SVG, listo para insertar.
    pub qr: String,
}

/// Resultado de verificar un código.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resultado {
    pub ok: bool,
    /// Se usó un código de recuperación en vez del de la aplicación.
    pub recuperacion: bool,
    /// Códigos de recuperación que quedan.
    pub restantes: usize,
    /// Motivo del fallo, si lo hubo.
    pub motivo: Option<String>,
}

/// Alta a medias: el secreto ya está generado pero el usuario todavía no ha
/// demostrado que su aplicación lo lee bien.
struct Pendiente {
    metodo: Metodo,
    usuario: String,
    hash: String,
    secreto: String,
}

/// Estado del gestor del alta.
#[derive(Default)]
pub struct SeguridadState {
    pendiente: Mutex<Option<Pendiente>>,
}

/* -------------------------------------------------------------------------- */
/* Almacenamiento                                                             */
/* -------------------------------------------------------------------------- */

fn ruta(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
    Ok(dir.join(FICHERO))
}

fn leer(app: &AppHandle) -> Option<Guardado> {
    let ruta = ruta(app).ok()?;
    let bruto = std::fs::read_to_string(ruta).ok()?;
    serde_json::from_str(&bruto).ok()
}

fn escribir(app: &AppHandle, datos: &Guardado) -> Result<(), String> {
    let destino = ruta(app)?;
    let cuerpo = serde_json::to_string_pretty(datos)
        .map_err(|err| format!("no se pudo serializar la seguridad: {err}"))?;

    let temporal = destino.with_extension("tmp");
    std::fs::write(&temporal, cuerpo)
        .map_err(|err| format!("no se pudo escribir {}: {err}", temporal.display()))?;

    // Solo el dueño puede leerlo: dentro va el hash de la contraseña y el
    // secreto del segundo factor.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporal, std::fs::Permissions::from_mode(0o600));
    }

    std::fs::rename(&temporal, &destino)
        .map_err(|err| format!("no se pudo reemplazar {}: {err}", destino.display()))
}

fn ahora() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/* -------------------------------------------------------------------------- */
/* Contraseñas                                                                */
/* -------------------------------------------------------------------------- */

/// Calcula el hash de una contraseña con Argon2id.
pub fn hash_contrasena(contrasena: &str) -> Result<String, String> {
    if contrasena.len() < 8 {
        return Err("la contraseña debe tener al menos 8 caracteres".to_string());
    }
    Argon2::default()
        .hash_password(contrasena.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|err| format!("no se pudo proteger la contraseña: {err}"))
}

/// Comprueba una contraseña contra su hash.
pub fn verificar_contrasena(contrasena: &str, hash: &str) -> bool {
    let Ok(analizado) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(contrasena.as_bytes(), &analizado)
        .is_ok()
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

/// Estado del bloqueo.
#[tauri::command]
pub fn auth_seguridad_estado(app: AppHandle) -> EstadoSeguridad {
    match leer(&app) {
        Some(datos) => EstadoSeguridad {
            configurado: true,
            metodo: Some(datos.metodo.clave().to_string()),
            usuario: if datos.usuario.is_empty() {
                None
            } else {
                Some(datos.usuario)
            },
            segundo_factor: true,
            recuperacion_restante: datos.recuperacion.len(),
        },
        None => EstadoSeguridad {
            configurado: false,
            metodo: None,
            usuario: None,
            segundo_factor: false,
            recuperacion_restante: 0,
        },
    }
}

/// Empieza el alta: genera el secreto y devuelve el QR.
///
/// Todavía no se guarda nada. Hasta que el usuario no demuestre que su
/// aplicación lee bien el código, no se activa el bloqueo: si no, un QR mal
/// escaneado dejaría la aplicación cerrada para siempre.
#[tauri::command]
pub fn auth_alta_empezar(
    app: AppHandle,
    state: tauri::State<'_, SeguridadState>,
    metodo: Metodo,
    usuario: String,
    contrasena: Option<String>,
) -> Result<Alta, String> {
    if leer(&app).is_some() && metodo == Metodo::Local {
        return Err("ya hay una cuenta local configurada".to_string());
    }

    let usuario = usuario.trim().to_string();
    if metodo == Metodo::Local && usuario.is_empty() {
        return Err("hace falta un nombre de usuario".to_string());
    }

    let hash = match metodo {
        Metodo::Local => hash_contrasena(contrasena.as_deref().unwrap_or(""))?,
        // Con un proveedor no hay contraseña local: la identifica él.
        _ => String::new(),
    };

    let secreto = totp::generar_secreto();
    let cuenta = if usuario.is_empty() {
        EMISOR.to_string()
    } else {
        usuario.clone()
    };
    let uri = totp::uri_otpauth(EMISOR, &cuenta, &secreto);
    let qr = totp::qr_svg(&uri)?;

    *state
        .pendiente
        .lock()
        .map_err(|_| "el gestor de seguridad está bloqueado".to_string())? = Some(Pendiente {
        metodo,
        usuario,
        hash,
        secreto: secreto.clone(),
    });

    Ok(Alta { secreto, uri, qr })
}

/// Confirma el alta comprobando un código de la aplicación.
///
/// Devuelve los códigos de recuperación, que es la **única vez** que se enseñan
/// en claro.
#[tauri::command]
pub fn auth_alta_confirmar(
    app: AppHandle,
    state: tauri::State<'_, SeguridadState>,
    codigo: String,
) -> Result<Vec<String>, String> {
    let pendiente = {
        let mut guard = state
            .pendiente
            .lock()
            .map_err(|_| "el gestor de seguridad está bloqueado".to_string())?;
        guard
            .take()
            .ok_or_else(|| "no hay ningún alta en curso".to_string())?
    };

    if !totp::verificar(&pendiente.secreto, &codigo, totp::ahora()) {
        // Se devuelve el alta al estado para que pueda reintentarlo sin volver
        // a escanear el código.
        *state
            .pendiente
            .lock()
            .map_err(|_| "el gestor de seguridad está bloqueado".to_string())? = Some(pendiente);
        return Err(
            "el código no es válido. Comprueba que el reloj del equipo va bien y que has \
             escaneado el código QR correcto."
                .to_string(),
        );
    }

    // Se generan aquí y no antes para que los que se enseñan sean exactamente
    // los que quedan guardados: si se generaran dos veces, el usuario se
    // llevaría unos códigos que no valdrían.
    let en_claro = totp::generar_recuperacion(RECUPERACION);
    let hashes: Vec<String> = en_claro
        .iter()
        .map(|codigo| totp::hash_recuperacion(codigo))
        .collect();

    escribir(
        &app,
        &Guardado {
            metodo: pendiente.metodo,
            usuario: pendiente.usuario,
            hash: pendiente.hash,
            secreto: pendiente.secreto,
            recuperacion: hashes,
            creado: ahora(),
        },
    )?;

    Ok(en_claro)
}

/// Verifica las credenciales para desbloquear.
///
/// Con método local hacen falta nombre, contraseña **y** código. Con un
/// proveedor basta el código: la primera mitad ya la demostró el proveedor.
#[tauri::command]
pub fn auth_desbloquear(
    app: AppHandle,
    usuario: Option<String>,
    contrasena: Option<String>,
    codigo: String,
) -> Result<Resultado, String> {
    let Some(mut datos) = leer(&app) else {
        // Sin bloqueo configurado no hay nada que verificar.
        return Ok(Resultado {
            ok: true,
            recuperacion: false,
            restantes: 0,
            motivo: None,
        });
    };

    let fallo = |motivo: &str| Resultado {
        ok: false,
        recuperacion: false,
        restantes: datos.recuperacion.len(),
        motivo: Some(motivo.to_string()),
    };

    // --- Primer factor -------------------------------------------------------
    if datos.metodo == Metodo::Local {
        let usuario = usuario.unwrap_or_default();
        if usuario.trim() != datos.usuario {
            return Ok(fallo("el usuario no es correcto"));
        }
        let contrasena = contrasena.unwrap_or_default();
        if !verificar_contrasena(&contrasena, &datos.hash) {
            return Ok(fallo("la contraseña no es correcta"));
        }
    } else {
        // Con un proveedor, la primera mitad es suya: si no hay sesión abierta
        // con ese proveedor, el código por sí solo no debe abrir nada.
        let cuenta = super::read_stored(&app).account;
        let corresponde = matches!(
            (datos.metodo, cuenta.map(|cuenta| cuenta.provider)),
            (Metodo::Google, Some(super::AuthProvider::Google))
                | (Metodo::GitHub, Some(super::AuthProvider::GitHub))
        );
        if !corresponde {
            return Ok(fallo(
                "no hay ninguna sesión abierta con ese proveedor: inicia sesión primero",
            ));
        }
    }

    // --- Segundo factor ------------------------------------------------------
    if totp::verificar(&datos.secreto, &codigo, totp::ahora()) {
        return Ok(Resultado {
            ok: true,
            recuperacion: false,
            restantes: datos.recuperacion.len(),
            motivo: None,
        });
    }

    // ¿Es un código de recuperación?
    let normalizado = totp::hash_recuperacion(&codigo);
    if let Some(posicion) = datos.recuperacion.iter().position(|h| *h == normalizado) {
        // Un código de recuperación se gasta al usarlo.
        datos.recuperacion.remove(posicion);
        escribir(&app, &datos)?;
        return Ok(Resultado {
            ok: true,
            recuperacion: true,
            restantes: datos.recuperacion.len(),
            motivo: None,
        });
    }

    Ok(fallo(
        "el código no es válido. Si has perdido el móvil, usa uno de recuperación.",
    ))
}

/// Quita el bloqueo. Hace falta demostrar quién eres igual que para entrar.
#[tauri::command]
pub fn auth_seguridad_quitar(
    app: AppHandle,
    usuario: Option<String>,
    contrasena: Option<String>,
    codigo: String,
) -> Result<Resultado, String> {
    let resultado = auth_desbloquear(app.clone(), usuario, contrasena, codigo)?;
    if !resultado.ok {
        return Ok(resultado);
    }

    if let Ok(ruta) = ruta(&app) {
        let _ = std::fs::remove_file(ruta);
    }
    Ok(resultado)
}

/// ¿Hay que pedir el segundo factor tras entrar con un proveedor?
#[tauri::command]
pub fn auth_pide_segundo_factor(app: AppHandle) -> bool {
    leer(&app).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_short_password_is_rejected() {
        let err = hash_contrasena("corta").unwrap_err();
        assert!(err.contains("8 caracteres"), "{err}");
    }

    #[test]
    fn a_password_round_trips() {
        let hash = hash_contrasena("contrasena-larga").expect("hash");
        assert!(verificar_contrasena("contrasena-larga", &hash));
        assert!(!verificar_contrasena("otra-cosa-distinta", &hash));
    }

    /// El mismo texto no debe dar el mismo hash: si no, dos usuarios con la
    /// misma contraseña tendrían el mismo valor guardado.
    #[test]
    fn the_same_password_hashes_differently_each_time() {
        let a = hash_contrasena("contrasena-larga").expect("hash");
        let b = hash_contrasena("contrasena-larga").expect("hash");
        assert_ne!(a, b);
        // Y los dos siguen siendo válidos.
        assert!(verificar_contrasena("contrasena-larga", &a));
        assert!(verificar_contrasena("contrasena-larga", &b));
    }

    #[test]
    fn a_corrupt_hash_does_not_verify() {
        assert!(!verificar_contrasena("lo-que-sea", "esto no es un hash"));
        assert!(!verificar_contrasena("lo-que-sea", ""));
    }

    #[test]
    fn method_keys_are_the_wire_format() {
        assert_eq!(Metodo::Local.clave(), "local");
        assert_eq!(Metodo::Google.clave(), "google");
        assert_eq!(Metodo::GitHub.clave(), "github");

        let leido: Metodo = serde_json::from_str("\"github\"").unwrap();
        assert_eq!(leido, Metodo::GitHub);
    }
}
