//! Abrir archivos con un editor externo.
//!
//! Para un archivo **local** basta con lanzar el editor sobre él.
//!
//! Para uno **remoto** el trabajo es mayor: se descarga a una carpeta temporal,
//! se abre con el editor y se **vigila**. Cada vez que el archivo cambia —es
//! decir, cada vez que se guarda— se vuelve a subir al servidor. Así se edita
//! «en su sitio» sin que haya que acordarse de subir nada a mano.

use super::{get_handle, SftpManager, CHUNK};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Cada cuánto se mira si el archivo ha cambiado.
const INTERVALO_VIGILANCIA: Duration = Duration::from_secs(2);

/// Margen tras detectar un cambio, para dejar que el editor termine de escribir.
const ESPERA_TRAS_CAMBIO: Duration = Duration::from_millis(400);

/// Carpeta, dentro del directorio temporal del sistema, donde se dejan las
/// copias de trabajo.
const CARPETA: &str = "cloudterm-editor";

/* -------------------------------------------------------------------------- */
/* Editores                                                                   */
/* -------------------------------------------------------------------------- */

/// Un editor instalado que se puede ofrecer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Editor {
    /// Identificador estable, para guardarlo en los ajustes.
    pub id: String,
    pub label: String,
    /// Programa que se lanza.
    pub program: String,
}

/// Editores que se buscan, en orden de preferencia.
///
/// Solo hay editores **gráficos**: lanzar `vim` desde una aplicación sin
/// terminal no lleva a ninguna parte.
const CONOCIDOS: &[(&str, &str, &str)] = &[
    ("code", "Visual Studio Code", "code"),
    ("code-oss", "Visual Studio Code (OSS)", "code-oss"),
    ("codium", "VSCodium", "codium"),
    ("cursor", "Cursor", "cursor"),
    ("windsurf", "Windsurf", "windsurf"),
    ("zed", "Zed", "zed"),
    ("subl", "Sublime Text", "subl"),
    ("kate", "Kate", "kate"),
    ("gedit", "Gedit", "gedit"),
    ("gnome-text-editor", "Editor de GNOME", "gnome-text-editor"),
    ("xed", "Xed", "xed"),
    ("mousepad", "Mousepad", "mousepad"),
    ("pluma", "Pluma", "pluma"),
    ("notepad++", "Notepad++", "notepad++"),
    ("notepad", "Notepad", "notepad"),
];

/// ¿Existe este programa en el `PATH`?
fn en_path(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|dir| {
        let directo = dir.join(program);
        if directo.is_file() {
            return true;
        }
        // En Windows los ejecutables llevan extensión.
        if cfg!(windows) {
            let exe = dir.join(format!("{program}.exe"));
            return exe.is_file();
        }
        false
    })
}

/// Editores instalados en este equipo.
#[tauri::command]
pub fn editores_disponibles() -> Vec<Editor> {
    CONOCIDOS
        .iter()
        .filter(|(_, _, program)| en_path(program))
        .map(|(id, label, program)| Editor {
            id: (*id).to_string(),
            label: (*label).to_string(),
            program: (*program).to_string(),
        })
        .collect()
}

/// Abre un archivo o carpeta local con un programa concreto.
///
/// Sin `program` se usa la aplicación predeterminada del sistema.
#[tauri::command]
pub fn abrir_con(
    app: AppHandle,
    ruta: String,
    program: Option<String>,
) -> Result<(), String> {
    let camino = PathBuf::from(&ruta);
    if !camino.exists() {
        return Err(format!("no existe {ruta}"));
    }

    let program = program.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    app.opener()
        .open_path(ruta, program)
        .map_err(|err| format!("no se pudo abrir con el editor: {err}"))
}

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

/// Una edición en curso sobre un archivo remoto.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEdit {
    pub id: String,
    pub session_id: String,
    pub remote_path: String,
    pub local_path: String,
    pub program: String,
    /// Cuándo se subió por última vez, en milisegundos UNIX.
    pub uploaded_at: Option<i64>,
    /// Si la última subida falló, por qué.
    pub error: Option<String>,
}

struct Abierta {
    info: RemoteEdit,
    parar: Arc<AtomicBool>,
}

/// Estado de las ediciones abiertas.
#[derive(Default)]
pub struct EditManager {
    abiertas: tokio::sync::Mutex<HashMap<String, Abierta>>,
    contador: AtomicU64,
}

impl EditManager {
    fn siguiente_id(&self) -> String {
        let n = self.contador.fetch_add(1, Ordering::Relaxed) + 1;
        let ahora = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        format!("edit-{ahora}-{n}")
    }
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

fn carpeta_temporal() -> PathBuf {
    std::env::temp_dir().join(CARPETA)
}

/// Firma del archivo: marca de tiempo y tamaño. Si cambia, alguien lo guardó.
fn firma(path: &Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some((mtime, meta.len()))
}

fn ahora_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Descarga un archivo remoto a una ruta local.
async fn descargar(
    handle: &super::SftpHandle,
    remoto: &str,
    local: &Path,
) -> Result<u64, String> {
    if let Some(parent) = local.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|err| format!("no se pudo crear {}: {err}", parent.display()))?;
    }

    let mut origen = handle
        .session
        .open(remoto)
        .await
        .map_err(|err| format!("no se pudo abrir {remoto}: {err}"))?;
    let mut destino = tokio::fs::File::create(local)
        .await
        .map_err(|err| format!("no se pudo crear {}: {err}", local.display()))?;

    let mut buffer = vec![0u8; CHUNK];
    let mut total = 0u64;
    loop {
        let leido = origen
            .read(&mut buffer)
            .await
            .map_err(|err| format!("error leyendo {remoto}: {err}"))?;
        if leido == 0 {
            break;
        }
        destino
            .write_all(&buffer[..leido])
            .await
            .map_err(|err| format!("error escribiendo {}: {err}", local.display()))?;
        total += leido as u64;
    }

    destino
        .flush()
        .await
        .map_err(|err| format!("no se pudo volcar {}: {err}", local.display()))?;
    let _ = origen.close().await;
    Ok(total)
}

/// Sube un archivo local al servidor, sobrescribiendo el remoto.
async fn subir(handle: &super::SftpHandle, local: &Path, remoto: &str) -> Result<u64, String> {
    let mut origen = tokio::fs::File::open(local)
        .await
        .map_err(|err| format!("no se pudo abrir {}: {err}", local.display()))?;
    // `create` es CREATE|TRUNCATE|WRITE: necesario para sobrescribir.
    let mut destino = handle
        .session
        .create(remoto)
        .await
        .map_err(|err| format!("no se pudo crear {remoto}: {err}"))?;

    let mut buffer = vec![0u8; CHUNK];
    let mut total = 0u64;
    loop {
        let leido = origen
            .read(&mut buffer)
            .await
            .map_err(|err| format!("error leyendo {}: {err}", local.display()))?;
        if leido == 0 {
            break;
        }
        destino
            .write_all(&buffer[..leido])
            .await
            .map_err(|err| format!("error escribiendo {remoto}: {err}"))?;
        total += leido as u64;
    }

    // `close` espera el acuse del servidor: sin esto se perderían datos.
    destino
        .close()
        .await
        .map_err(|err| format!("no se pudo cerrar {remoto}: {err}"))?;
    Ok(total)
}

/// Nombre de archivo seguro a partir de una ruta remota.
///
/// Se toma el último tramo que sea un nombre de verdad: ni vacío, ni `.`, ni
/// `..`. Así `/var/log/` da `log` y no se cuela un `..` en la carpeta temporal.
fn nombre_local(remoto: &str) -> String {
    let ultimo = remoto
        .rsplit('/')
        .find(|parte| !parte.is_empty() && *parte != "." && *parte != "..")
        .unwrap_or("archivo");

    // No debería llegar ningún separador aquí, pero si el servidor devolviese
    // algo raro se limpia igualmente.
    let limpio: String = ultimo
        .chars()
        .filter(|c| *c != '/' && *c != '\\' && *c != '\0')
        .collect();

    if limpio.is_empty() {
        "archivo".to_string()
    } else {
        limpio
    }
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

/// Descarga un archivo remoto, lo abre con el editor y lo vigila.
///
/// Devuelve la edición creada; a partir de ahí, cada guardado se sube solo.
#[tauri::command]
pub async fn editar_remoto(
    app: AppHandle,
    sftp: State<'_, SftpManager>,
    edits: State<'_, EditManager>,
    session_id: String,
    remote_path: String,
    program: String,
) -> Result<RemoteEdit, String> {
    if program.trim().is_empty() {
        return Err("hace falta indicar con qué editor abrirlo".to_string());
    }

    let handle = get_handle(&sftp, &session_id).await?;

    let id = edits.siguiente_id();
    // Cada edición tiene su propia carpeta para que dos archivos con el mismo
    // nombre en servidores distintos no se pisen.
    let local = carpeta_temporal().join(&id).join(nombre_local(&remote_path));

    descargar(&handle, &remote_path, &local).await?;

    let info = RemoteEdit {
        id: id.clone(),
        session_id: session_id.clone(),
        remote_path: remote_path.clone(),
        local_path: local.to_string_lossy().to_string(),
        program: program.clone(),
        uploaded_at: None,
        error: None,
    };

    // Abrir el editor puede fallar (programa mal escrito): mejor saberlo ahora
    // que dejar una edición fantasma.
    app.opener()
        .open_path(info.local_path.clone(), Some(program))
        .map_err(|err| format!("no se pudo abrir el editor: {err}"))?;

    let parar = Arc::new(AtomicBool::new(false));
    edits.abiertas.lock().await.insert(
        id.clone(),
        Abierta {
            info: info.clone(),
            parar: parar.clone(),
        },
    );

    tauri::async_runtime::spawn(vigilar(app, session_id, id, local, remote_path, parar));

    Ok(info)
}

/// Vigila el archivo local y sube cada cambio.
async fn vigilar(
    app: AppHandle,
    session_id: String,
    id: String,
    local: PathBuf,
    remoto: String,
    parar: Arc<AtomicBool>,
) {
    let mut ultima = firma(&local);

    while !parar.load(Ordering::Relaxed) {
        tokio::time::sleep(INTERVALO_VIGILANCIA).await;
        if parar.load(Ordering::Relaxed) {
            break;
        }

        let actual = firma(&local);
        if actual == ultima || actual.is_none() {
            continue;
        }

        // El editor puede escribir en varios pasos; se le da un respiro antes de
        // leer el resultado definitivo.
        tokio::time::sleep(ESPERA_TRAS_CAMBIO).await;
        let definitiva = firma(&local);

        let resultado = subir_archivo(&app, &session_id, &local, &remoto).await;
        let subido = resultado.is_ok();
        registrar_resultado(&app, &id, resultado).await;

        // La firma solo se da por buena si la subida salió bien: si falló, se
        // reintenta en la vuelta siguiente en vez de darlo por hecho.
        if subido {
            ultima = definitiva;
        }
    }
}

/// Sube el archivo usando el gestor de SFTP que vive en el estado de Tauri.
async fn subir_archivo(
    app: &AppHandle,
    session_id: &str,
    local: &Path,
    remoto: &str,
) -> Result<u64, String> {
    let sftp = app.state::<SftpManager>();
    let handle = get_handle(&sftp, session_id).await?;
    subir(&handle, local, remoto).await
}

/// Anota el resultado de una subida y avisa a la interfaz.
async fn registrar_resultado(app: &AppHandle, id: &str, resultado: Result<u64, String>) {
    let edits = app.state::<EditManager>();
    let mut abiertas = edits.abiertas.lock().await;
    let Some(abierta) = abiertas.get_mut(id) else {
        return;
    };

    let (ok, detalle) = match resultado {
        Ok(bytes) => {
            abierta.info.uploaded_at = Some(ahora_ms());
            abierta.info.error = None;
            (true, format!("{bytes} bytes"))
        }
        Err(err) => {
            abierta.info.error = Some(err.clone());
            (false, err)
        }
    };

    let payload = serde_json::json!({
        "id": id,
        "remotePath": abierta.info.remote_path,
        "ok": ok,
        "detail": detalle,
    });
    drop(abiertas);

    let _ = app.emit("edit://subido", payload);
}

/// Ediciones abiertas ahora mismo.
#[tauri::command]
pub async fn editar_listar(edits: State<'_, EditManager>) -> Result<Vec<RemoteEdit>, String> {
    let abiertas = edits.abiertas.lock().await;
    Ok(abiertas.values().map(|a| a.info.clone()).collect())
}

/// Fuerza una subida sin esperar a que cambie el archivo.
#[tauri::command]
pub async fn editar_subir(
    app: AppHandle,
    edits: State<'_, EditManager>,
    id: String,
) -> Result<RemoteEdit, String> {
    let (session_id, local, remoto) = {
        let abiertas = edits.abiertas.lock().await;
        let abierta = abiertas
            .get(&id)
            .ok_or_else(|| format!("no hay ninguna edición abierta con id {id}"))?;
        (
            abierta.info.session_id.clone(),
            PathBuf::from(&abierta.info.local_path),
            abierta.info.remote_path.clone(),
        )
    };

    let resultado = subir_archivo(&app, &session_id, &local, &remoto).await;
    registrar_resultado(&app, &id, resultado).await;

    let abiertas = edits.abiertas.lock().await;
    abiertas
        .get(&id)
        .map(|a| a.info.clone())
        .ok_or_else(|| format!("no hay ninguna edición abierta con id {id}"))
}

/// Termina la edición: deja de vigilar y borra la copia temporal.
///
/// Con `subir` a `true` se hace una última subida antes de cerrar, por si había
/// cambios sin guardar cuando el usuario pulsó el botón.
#[tauri::command]
pub async fn editar_terminar(
    app: AppHandle,
    edits: State<'_, EditManager>,
    id: String,
    subir_cambios: bool,
) -> Result<(), String> {
    terminar(&app, &edits, &id, subir_cambios).await;
    Ok(())
}

/// Cierra todas las ediciones. Lo usa el frontend al salir.
#[tauri::command]
pub async fn editar_cerrar_todas(
    app: AppHandle,
    edits: State<'_, EditManager>,
) -> Result<(), String> {
    let ids: Vec<String> = edits.abiertas.lock().await.keys().cloned().collect();
    for id in ids {
        terminar(&app, &edits, &id, true).await;
    }
    Ok(())
}

/// Cuerpo compartido por los dos comandos de cierre.
async fn terminar(app: &AppHandle, edits: &EditManager, id: &str, subir_cambios: bool) {
    let Some(abierta) = edits.abiertas.lock().await.remove(id) else {
        return;
    };
    abierta.parar.store(true, Ordering::Relaxed);

    if subir_cambios {
        let local = PathBuf::from(&abierta.info.local_path);
        if local.exists() {
            let _ = subir_archivo(app, &abierta.info.session_id, &local, &abierta.info.remote_path)
                .await;
        }
    }

    // La carpeta es de esta edición y ya no sirve para nada.
    if let Some(carpeta) = Path::new(&abierta.info.local_path).parent() {
        let _ = tokio::fs::remove_dir_all(carpeta).await;
    }
}

/// Carpeta donde se dejan las copias de trabajo, para poder enseñarla.
#[tauri::command]
pub fn editar_carpeta() -> String {
    carpeta_temporal().to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_name_comes_from_the_remote_path() {
        assert_eq!(nombre_local("/var/log/syslog"), "syslog");
        assert_eq!(nombre_local("archivo.txt"), "archivo.txt");
        // Una ruta que termina en barra no puede dar un nombre vacío.
        assert_eq!(nombre_local("/var/log/"), "log");
        assert_eq!(nombre_local(""), "archivo");
    }

    /// El nombre temporal no puede colarse en la carpeta de al lado.
    #[test]
    fn local_name_never_escapes_the_folder() {
        for remoto in ["/etc/../../etc/passwd", "..", "/"] {
            let nombre = nombre_local(remoto);
            assert!(!nombre.contains('/'), "{nombre}");
            assert_ne!(nombre, "..", "{remoto}");
        }
    }

    #[test]
    fn signature_changes_when_the_file_changes() {
        let dir = std::env::temp_dir().join("cloudterm-prueba-firma");
        std::fs::create_dir_all(&dir).expect("carpeta");
        let archivo = dir.join("a.txt");

        std::fs::write(&archivo, "uno").expect("escribir");
        let primera = firma(&archivo).expect("firma");

        std::thread::sleep(Duration::from_millis(20));
        std::fs::write(&archivo, "contenido más largo").expect("escribir");
        let segunda = firma(&archivo).expect("firma");

        assert_ne!(primera, segunda, "el tamaño cambió: la firma debe cambiar");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_has_no_signature() {
        assert!(firma(Path::new("/no/existe/de/ninguna/manera")).is_none());
    }

    #[test]
    fn ids_do_not_repeat() {
        let manager = EditManager::default();
        let a = manager.siguiente_id();
        let b = manager.siguiente_id();
        assert_ne!(a, b);
        assert!(a.starts_with("edit-"), "{a}");
    }

    /// Lo importante: no se ofrece ningún editor que no esté instalado.
    #[test]
    fn only_installed_editors_are_offered() {
        let lista = editores_disponibles();
        for editor in &lista {
            assert!(
                en_path(&editor.program),
                "{} se ofrece pero no está instalado",
                editor.program
            );
        }
    }

    #[test]
    fn detection_matches_the_path_lookup() {
        // `sh` existe en cualquier sistema tipo Unix; `no-existe-jamas` no.
        assert_eq!(en_path("sh"), cfg!(unix));
        assert!(!en_path("no-existe-jamas-12345"));
    }
}
