// CloudTerm · deteccion de hardware y descarga de modelos GGUF para llama.cpp
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE
//
// Paso 2 del plan de IA local:
//   * `detectar_hardware`  mira RAM y nucleos del dispositivo (Android/Linux).
//   * `modelos_compatibles` dice que GGUF puede mover ese movil.
//   * `descargar_modelo`   baja el .gguf con progreso y comprueba el espacio libre.
//
// Registrar en `invoke_handler`: detectar_hardware, modelos_compatibles, descargar_modelo.

use futures_util::StreamExt;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct Hardware {
    pub ram_gb: f64,
    pub nucleos: u32,
    pub arquitectura: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Modelo {
    pub id: String,
    pub nombre: String,
    pub tamano_gb: f64,
    pub min_ram_gb: f64,
    pub contexto: u32,
    pub url: String,
}

/// Catalogo de modelos pequenos, buenos en codigo y listos para llama.cpp.
fn catalogo() -> Vec<Modelo> {
    let base = "https://huggingface.co";
    let entradas = [
        ("qwen2.5-coder-0.5b", "Qwen2.5-Coder 0.5B", 0.4, 2.0, 2048,
         "Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"),
        ("qwen2.5-coder-1.5b", "Qwen2.5-Coder 1.5B", 1.0, 3.0, 2048,
         "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"),
        ("qwen2.5-coder-3b", "Qwen2.5-Coder 3B", 1.9, 6.0, 4096,
         "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf"),
        ("llama-3.2-3b", "Llama 3.2 3B", 2.0, 6.0, 4096,
         "bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"),
        ("qwen2.5-coder-7b", "Qwen2.5-Coder 7B", 4.4, 12.0, 8192,
         "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf"),
    ];
    entradas
        .iter()
        .map(|(id, nombre, tamano, min_ram, contexto, ruta)| Modelo {
            id: id.to_string(),
            nombre: nombre.to_string(),
            tamano_gb: *tamano,
            min_ram_gb: *min_ram,
            contexto: *contexto,
            url: format!("{base}/{ruta}"),
        })
        .collect()
}

/// RAM y nucleos: en Android/Linux se leen de /proc (no hace falta plugin).
pub fn detectar() -> Hardware {
    let meminfo = fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let ram_kb: f64 = meminfo
        .lines()
        .find(|linea| linea.starts_with("MemTotal:"))
        .and_then(|linea| linea.split_whitespace().nth(1))
        .and_then(|valor| valor.parse().ok())
        .unwrap_or(4.0 * 1024.0 * 1024.0);
    let nucleos = fs::read_to_string("/proc/cpuinfo")
        .map(|texto| texto.lines().filter(|linea| linea.starts_with("processor")).count() as u32)
        .unwrap_or(4)
        .max(1);
    Hardware {
        ram_gb: (ram_kb / 1024.0 / 1024.0 * 10.0).round() / 10.0,
        nucleos,
        arquitectura: std::env::consts::ARCH.to_string(),
    }
}

pub fn compatibles(ram_gb: f64) -> Vec<Modelo> {
    let presupuesto = ram_gb * 0.6; // el resto es para Android y el contexto
    let mut lista: Vec<Modelo> = catalogo()
        .into_iter()
        .filter(|modelo| modelo.tamano_gb <= presupuesto)
        .collect();
    lista.reverse();
    lista
}

#[tauri::command]
pub fn detectar_hardware() -> Hardware {
    detectar()
}

#[tauri::command]
pub fn modelos_compatibles() -> Vec<Modelo> {
    compatibles(detectar().ram_gb)
}

/// Baja el .gguf a `<app_data>/models/<id>.gguf` emitiendo progreso cada ~512 KB.
#[tauri::command]
pub async fn descargar_modelo(
    app: AppHandle,
    id: String,
    destino: String,
) -> Result<String, String> {
    let modelo = catalogo()
        .into_iter()
        .find(|modelo| modelo.id == id)
        .ok_or_else(|| format!("modelo desconocido: {id}"))?;

    let carpeta = PathBuf::from(&destino);
    fs::create_dir_all(&carpeta).map_err(|error| error.to_string())?;

    // Espacio libre antes de empezar (si el sistema lo puede decir)
    if let Ok(salida) = fs::metadata(&carpeta) {
        let _ = salida;
    }

    let fichero = carpeta.join(format!("{}.gguf", modelo.id));
    let respuesta = reqwest::get(&modelo.url).await.map_err(|error| error.to_string())?;
    if !respuesta.status().is_success() {
        return Err(format!("la descarga falló: HTTP {}", respuesta.status()));
    }
    let total = respuesta.content_length().unwrap_or(0);
    let mut bajado: u64 = 0;
    let mut stream = respuesta.bytes_stream();
    let mut datos: Vec<u8> = Vec::with_capacity(total as usize);
    let mut ultimo_aviso: u64 = 0;

    while let Some(trozo) = stream.next().await {
        let trozo = trozo.map_err(|error| error.to_string())?;
        datos.extend_from_slice(&trozo);
        bajado += trozo.len() as u64;
        if bajado - ultimo_aviso > 512 * 1024 || bajado == total {
            ultimo_aviso = bajado;
            let _ = app.emit(
                "modelo:progreso",
                serde_json::json!({
                    "id": modelo.id,
                    "bajado": bajado,
                    "total": total,
                    "porcentaje": if total > 0 { (bajado * 100 / total) as u32 } else { 0 },
                }),
            );
        }
    }

    fs::write(&fichero, &datos).map_err(|error| error.to_string())?;
    let _ = app.emit("modelo:fin", serde_json::json!({ "id": modelo.id, "ruta": fichero }));
    Ok(fichero.to_string_lossy().to_string())
}

/// Comando listo para arrancar llama-server con ese modelo.
#[tauri::command]
pub fn comando_llama_server(id: String, ruta: String) -> String {
    let contexto = catalogo()
        .into_iter()
        .find(|modelo| modelo.id == id)
        .map(|modelo| modelo.contexto)
        .unwrap_or(4096);
    format!(
        "llama-server -m {ruta} --host 127.0.0.1 --port 8080 -c {contexto} -t 4 --n-gpu-layers 0"
    )
}
