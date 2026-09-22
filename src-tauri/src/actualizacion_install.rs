/// Descarga el paquete de esta plataforma e instala sin asistente visible.
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
    aplicar_paquete(&destino)?;
    // El instalador sustituye los ficheros: hay que cerrar CloudTerm.
    let salir = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        salir.exit(0);
    });
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

fn extension(ruta: &std::path::Path) -> String {
    ruta.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn aplicar_paquete(ruta: &std::path::Path) -> Result<(), String> {
    let ext = extension(ruta);

    // En Android no se usa la extensión: no hay paquetes que aplicar. En el
    // resto de plataformas sí, y cada rama la consume.
    #[cfg(target_os = "android")]
    let _ = &ext;

    #[cfg(windows)]
    {
        let _ = ext;
        std::process::Command::new(ruta)
            .arg("/S")
            .spawn()
            .map_err(|err| format!("no se pudo lanzar el instalador silencioso: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let _ = ext;
        std::process::Command::new("open")
            .arg(ruta)
            .spawn()
            .map_err(|err| format!("no se pudo abrir el paquete: {err}"))?;
        return Ok(());
    }

    // Android es unix, pero no tiene ni `pkexec`, ni `xdg-open`, ni paquetes
    // `.deb`/AppImage: las actualizaciones llegan por la tienda o reinstalando
    // el APK. Sin esta exclusión, la rama de abajo intentaría lanzarlos y el
    // usuario vería un «os error 2» sin explicación.
    #[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
    {
        use std::os::unix::fs::PermissionsExt;
        if ext == "appimage" {
            let _ = std::fs::set_permissions(ruta, PermissionsExt::from_mode(0o755));
            if let Ok(actual) = std::env::var("APPIMAGE") {
                let destino = std::path::PathBuf::from(actual);
                std::fs::copy(ruta, &destino).map_err(|err| {
                    format!("no se pudo sustituir el AppImage: {err}")
                })?;
                let _ = std::fs::set_permissions(&destino, PermissionsExt::from_mode(0o755));
                let _ = std::process::Command::new(&destino).spawn();
                return Ok(());
            }
            std::process::Command::new(ruta)
                .spawn()
                .map_err(|err| format!("no se pudo arrancar el AppImage: {err}"))?;
            return Ok(());
        }
        if ext == "deb" {
            let status = std::process::Command::new("pkexec")
                .args(["dpkg", "-i", &ruta.to_string_lossy()])
                .status()
                .map_err(|err| {
                    format!("hace falta pkexec para instalar el .deb: {err}")
                })?;
            if !status.success() {
                return Err(format!(
                    "dpkg terminó con código {:?}",
                    status.code()
                ));
            }
            return Ok(());
        }
        std::process::Command::new("xdg-open")
            .arg(ruta)
            .spawn()
            .map_err(|err| format!("no se pudo abrir el paquete: {err}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Este sistema no sabe aplicar la actualización.".into())
}
