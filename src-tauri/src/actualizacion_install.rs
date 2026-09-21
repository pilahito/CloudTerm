/// Descarga el instalador de esta plataforma y lo abre con el sistema.
#[tauri::command]
pub async fn descargar_e_instalar(app: tauri::AppHandle, url: String) -> Result<String, String> {
    if !url_permitida(&url) {
        return Err("La descarga tiene que salir de GitHub Releases.".into());
    }

    let cliente = reqwest::Client::builder()
        .user_agent("CloudTerm")
        .redirect(reqwest::redirect::Policy::limited(12))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|err| format!("no se pudo preparar la descarga: {err}"))?;

    let respuesta = cliente
        .get(&url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|err| format!("no se pudo conectar con GitHub: {err}"))?;

    if !respuesta.status().is_success() {
        return Err(format!("GitHub devolvió {}", respuesta.status()));
    }

    let total = respuesta.content_length().unwrap_or(0);
    let nombre = nombre_desde_url(&url);
    let destino = std::env::temp_dir().join(nombre);
    if destino.exists() {
        let _ = std::fs::remove_file(&destino);
    }

    let mut archivo = std::fs::File::create(&destino)
        .map_err(|err| format!("no se pudo crear el fichero temporal: {err}"))?;

    use futures_util::StreamExt;
    use std::io::Write;
    use tauri::Emitter;

    let mut leido = 0u64;
    let mut stream = respuesta.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("se cortó la descarga: {err}"))?;
        archivo
            .write_all(&chunk)
            .map_err(|err| format!("no se pudo escribir el instalador: {err}"))?;
        leido += chunk.len() as u64;
        let pct = if total > 0 {
            ((leido * 100) / total).min(100) as u8
        } else {
            0
        };
        let _ = app.emit("actualizacion-progreso", pct);
    }
    archivo
        .flush()
        .map_err(|err| format!("no se pudo cerrar el instalador: {err}"))?;

    if leido < 1024 {
        return Err("La descarga salió vacía.".into());
    }

    let _ = app.emit("actualizacion-progreso", 100u8);
    abrir_instalador(&destino)?;
    Ok(destino.display().to_string())
}

fn url_permitida(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.starts_with("https://")
        && (u.contains("github.com") || u.contains("githubusercontent.com"))
}

fn nombre_desde_url(url: &str) -> String {
    let ultimo = url
        .split('?')
        .next()
        .unwrap_or(url)
        .rsplit('/')
        .next()
        .unwrap_or("CloudTerm-update.bin");
    let limpio: String = ultimo
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    if limpio.is_empty() {
        "CloudTerm-update.bin".into()
    } else {
        limpio
    }
}

fn abrir_instalador(ruta: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &ruta.to_string_lossy()])
            .spawn()
            .map_err(|err| format!("no se pudo abrir el instalador: {err}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(ruta)
            .spawn()
            .map_err(|err| format!("no se pudo abrir el instalador: {err}"))?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if ruta
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("appimage"))
                .unwrap_or(false)
            {
                let _ = std::fs::set_permissions(ruta, PermissionsExt::from_mode(0o755));
            }
        }
        std::process::Command::new("xdg-open")
            .arg(ruta)
            .spawn()
            .map_err(|err| format!("no se pudo abrir el instalador: {err}"))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Este sistema no sabe abrir el instalador.".into())
}
