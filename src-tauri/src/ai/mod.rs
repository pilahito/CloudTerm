// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

//! Transporte real de los proveedores de IA.
//!
//! Habla dos dialectos, que es lo que cubre prácticamente todo el mercado:
//!
//! * **Ollama** — `POST /api/chat` con `stream: true`, que devuelve **una línea
//!   JSON por fragmento**.
//! * **Compatible con OpenAI** (DeepSeek, OpenAI, LM Studio, vLLM…) —
//!   `POST /chat/completions` con `stream: true`, que devuelve **SSE**
//!   (`data: {...}` y un `data: [DONE]` final).
//!
//! El parseo va en funciones puras ([`parse_ollama_line`], [`parse_sse_line`])
//! para poder probarlo sin red.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::secrets;

/// Tiempo máximo para listar modelos.
const MODEL_LIST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);
/// Tiempo máximo para una conversación completa.
const CHAT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

/// Dialecto que habla un proveedor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProviderKind {
    /// `POST /api/chat`, líneas JSON.
    Ollama,
    /// `POST /chat/completions`, SSE.
    OpenAi,
}

/// Un proveedor configurado.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub label: String,
    pub kind: AiProviderKind,
    /// URL base **sin** la ruta final: se le añade `/api/chat` o `/chat/completions`.
    pub base_url: String,
    pub model: String,
    /// Nombre de la entrada del llavero que guarda la clave. `None` si no necesita.
    pub api_key_env: Option<String>,
}

/// Configuración completa, tal y como se guarda en `ai.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiConfig {
    pub providers: Vec<AiProviderConfig>,
    pub active_id: String,
    pub temperature: f32,
    pub system_prompt: String,
    /// Tope de tokens de salida; `0` deja decidir al proveedor.
    pub max_tokens: u32,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            providers: vec![
                AiProviderConfig {
                    id: "ollama".to_string(),
                    label: "Ollama (local)".to_string(),
                    kind: AiProviderKind::Ollama,
                    base_url: "http://127.0.0.1:11434".to_string(),
                    model: "qwen3-local:8b".to_string(),
                    api_key_env: None,
                },
                AiProviderConfig {
                    id: "deepseek".to_string(),
                    label: "DeepSeek".to_string(),
                    kind: AiProviderKind::OpenAi,
                    base_url: "https://api.deepseek.com/v1".to_string(),
                    model: "deepseek-chat".to_string(),
                    api_key_env: Some("DEEPSEEK_API_KEY".to_string()),
                },
                AiProviderConfig {
                    id: "custom".to_string(),
                    label: "Compatible con OpenAI".to_string(),
                    kind: AiProviderKind::OpenAi,
                    base_url: "http://127.0.0.1:1234/v1".to_string(),
                    model: String::new(),
                    api_key_env: Some("CUSTOM_AI_API_KEY".to_string()),
                },
            ],
            active_id: "ollama".to_string(),
            temperature: 0.3,
            system_prompt: "Eres un asistente dentro de CloudTerm, un cliente SSH/SFTP. \
                             Respondes en castellano, de forma breve y técnica, y propones \
                             comandos concretos cuando ayudan."
                .to_string(),
            max_tokens: 0,
        }
    }
}

/// Un mensaje de la conversación.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

/// Petición de conversación.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    /// Identificador con el que se etiquetan los fragmentos y se cancela.
    pub session_id: String,
    pub provider_id: String,
    pub model: String,
    pub messages: Vec<AiMessage>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

/// Un trozo de respuesta ya interpretado.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Delta {
    pub content: String,
    /// Razonamiento previo (Qwen3 y otros modelos que «piensan»). No se pinta
    /// como respuesta, pero se extrae para no confundirlo con contenido vacío.
    pub thinking: String,
    pub done: bool,
}

/// Lo que se envía al frontend por `ai://chunk`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChunk {
    pub session_id: String,
    pub delta: String,
    pub done: bool,
    pub error: Option<String>,
}

/* -------------------------------------------------------------------------- */
/* Parseo (funciones puras, probadas sin red)                                 */
/* -------------------------------------------------------------------------- */

/// Interpreta una línea del flujo de Ollama: un objeto JSON por fragmento.
pub fn parse_ollama_line(line: &str) -> Option<Delta> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).ok()?;
    let done = value.get("done").and_then(serde_json::Value::as_bool).unwrap_or(false);
    let message = value.get("message");
    let content = message
        .and_then(|message| message.get("content"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    // Qwen3 y compañía mandan el razonamiento en `thinking`, con `content`
    // vacío mientras piensan.
    let thinking = message
        .and_then(|message| message.get("thinking"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();

    if content.is_empty() && thinking.is_empty() && !done {
        return None;
    }
    Some(Delta {
        content,
        thinking,
        done,
    })
}

/// Interpreta una línea del flujo SSE de OpenAI/DeepSeek.
pub fn parse_sse_line(line: &str) -> Option<Delta> {
    let trimmed = line.trim();
    let payload = trimmed.strip_prefix("data:")?.trim();
    if payload.is_empty() {
        return None;
    }
    if payload == "[DONE]" {
        return Some(Delta {
            done: true,
            ..Delta::default()
        });
    }

    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    let delta = value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("delta"));

    let content = delta
        .and_then(|delta| delta.get("content"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    // Algunos proveedores compatibles usan `reasoning_content` para el razonamiento.
    let thinking = delta
        .and_then(|delta| delta.get("reasoning_content"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();

    if content.is_empty() && thinking.is_empty() {
        return None;
    }
    Some(Delta {
        content,
        thinking,
        done: false,
    })
}

/// Cuerpo de la petición de conversación, en el dialecto del proveedor.
pub fn build_chat_body(
    kind: AiProviderKind,
    model: &str,
    messages: &[AiMessage],
    temperature: f32,
    max_tokens: u32,
) -> serde_json::Value {
    match kind {
        AiProviderKind::Ollama => {
            let mut options = serde_json::json!({ "temperature": temperature });
            if max_tokens > 0 {
                options["num_predict"] = serde_json::json!(max_tokens);
            }
            serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": true,
                "options": options,
            })
        }
        AiProviderKind::OpenAi => {
            let mut body = serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": true,
                "temperature": temperature,
            });
            if max_tokens > 0 {
                body["max_tokens"] = serde_json::json!(max_tokens);
            }
            body
        }
    }
}

/// URL final de conversación a partir de la base configurada.
pub fn chat_url(kind: AiProviderKind, base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    match kind {
        AiProviderKind::Ollama => format!("{base}/api/chat"),
        AiProviderKind::OpenAi => format!("{base}/chat/completions"),
    }
}

/// URL de listado de modelos.
pub fn models_url(kind: AiProviderKind, base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    match kind {
        AiProviderKind::Ollama => format!("{base}/api/tags"),
        AiProviderKind::OpenAi => format!("{base}/models"),
    }
}

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

/// Conversaciones en curso, para poder cancelarlas.
#[derive(Default)]
pub struct AiManager {
    cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AiManager {
    fn begin(&self, session_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.cancellations.lock() {
            map.insert(session_id.to_string(), Arc::clone(&flag));
        }
        flag
    }

    fn finish(&self, session_id: &str) {
        if let Ok(mut map) = self.cancellations.lock() {
            map.remove(session_id);
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("no se pudo resolver el directorio de configuración: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("no se pudo crear {}: {err}", dir.display()))?;
    Ok(dir.join("ai.json"))
}

fn load_config_file(app: &AppHandle) -> Result<AiConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AiConfig::default());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|err| format!("no se pudo leer {}: {err}", path.display()))?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn save_config_file(app: &AppHandle, config: &AiConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config)
        .map_err(|err| format!("no se pudo serializar la configuración: {err}"))?;
    std::fs::write(&path, raw)
        .map_err(|err| format!("no se pudo escribir {}: {err}", path.display()))
}

fn find_provider(config: &AiConfig, provider_id: &str) -> Result<AiProviderConfig, String> {
    config
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .cloned()
        .ok_or_else(|| format!("no hay ningún proveedor configurado con id «{provider_id}»"))
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn ai_config_get(app: AppHandle) -> Result<AiConfig, String> {
    load_config_file(&app)
}

#[tauri::command]
pub fn ai_config_set(app: AppHandle, config: AiConfig) -> Result<(), String> {
    save_config_file(&app, &config)
}

/// Guarda la clave de un proveedor en el llavero del sistema.
#[tauri::command]
pub fn ai_set_api_key(reference: String, value: String) -> Result<(), String> {
    secrets::set_secret(&reference, &value)
}

/// ¿Hay clave guardada para esa referencia? (nunca devuelve la clave)
#[tauri::command]
pub fn ai_has_api_key(reference: String) -> Result<bool, String> {
    Ok(secrets::get_secret(&reference)?.is_some())
}

/// Lista los modelos disponibles en un proveedor.
#[tauri::command]
pub async fn ai_models(app: AppHandle, provider_id: String) -> Result<Vec<String>, String> {
    let config = load_config_file(&app)?;
    let provider = find_provider(&config, &provider_id)?;
    let url = models_url(provider.kind, &provider.base_url);

    let client = reqwest::Client::builder()
        .timeout(MODEL_LIST_TIMEOUT)
        .build()
        .map_err(|err| format!("no se pudo crear el cliente HTTP: {err}"))?;

    let mut request = client.get(&url);
    if let Some(reference) = &provider.api_key_env {
        if let Some(key) = secrets::get_secret(reference)? {
            request = request.bearer_auth(key);
        }
    }

    let response = request
        .send()
        .await
        .map_err(|err| format!("no se pudo consultar {url}: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "{url} respondió {} — revisa la URL y la clave",
            response.status()
        ));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|err| format!("respuesta ilegible de {url}: {err}"))?;

    // Ollama usa `models[].name`; el resto, `data[].id`.
    let mut models: Vec<String> = match provider.kind {
        AiProviderKind::Ollama => body
            .get("models")
            .and_then(serde_json::Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|item| item.get("name").and_then(serde_json::Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        AiProviderKind::OpenAi => body
            .get("data")
            .and_then(serde_json::Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
    };

    models.sort();
    Ok(models)
}

/// Comprueba que un proveedor responde, sin gastar tokens de más.
#[tauri::command]
pub async fn ai_test_provider(app: AppHandle, provider_id: String) -> Result<String, String> {
    let models = ai_models(app, provider_id).await?;
    if models.is_empty() {
        return Err("el proveedor responde pero no anuncia ningún modelo".to_string());
    }
    Ok(format!("{} modelos disponibles", models.len()))
}

/// Conversación en streaming.
///
/// Emite `ai://chunk` por cada fragmento y termina con `done: true`. Si algo
/// falla, el último evento lleva `error` en vez de propagar la excepción, para
/// que la interfaz pueda pintar el mensaje a medias en lugar de perderlo.
#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AiManager>,
    request: AiChatRequest,
) -> Result<(), String> {
    let config = load_config_file(&app)?;
    let provider = find_provider(&config, &request.provider_id)?;
    let session_id = request.session_id.clone();
    let flag = state.begin(&session_id);

    // El comando no devuelve el flujo: lo empuja por eventos. Se limpia el
    // registro al salir, pase lo que pase.
    let outcome = stream_chat(&app, &provider, &request, &flag).await;
    state.finish(&session_id);

    if let Err(message) = outcome {
        let _ = app.emit(
            "ai://chunk",
            AiChunk {
                session_id,
                delta: String::new(),
                done: true,
                error: Some(message.clone()),
            },
        );
        return Err(message);
    }
    Ok(())
}

/// Corta la conversación indicada.
#[tauri::command]
pub fn ai_cancel(state: State<'_, AiManager>, session_id: String) -> Result<bool, String> {
    let map = state
        .cancellations
        .lock()
        .map_err(|_| "gestor de IA bloqueado".to_string())?;
    match map.get(&session_id) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            Ok(true)
        }
        None => Ok(false),
    }
}

/// ¿Hay alguna conversación en curso?
#[tauri::command]
pub fn ai_active(state: State<'_, AiManager>) -> Result<Vec<String>, String> {
    let map = state
        .cancellations
        .lock()
        .map_err(|_| "gestor de IA bloqueado".to_string())?;
    Ok(map.keys().cloned().collect())
}

/* -------------------------------------------------------------------------- */
/* Motor de streaming                                                         */
/* -------------------------------------------------------------------------- */

async fn stream_chat(
    app: &AppHandle,
    provider: &AiProviderConfig,
    request: &AiChatRequest,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    let temperature = request.temperature.unwrap_or(0.3);
    let max_tokens = request.max_tokens.unwrap_or(0);
    let url = chat_url(provider.kind, &provider.base_url);
    let body = build_chat_body(provider.kind, &request.model, &request.messages, temperature, max_tokens);

    let client = reqwest::Client::builder()
        .timeout(CHAT_TIMEOUT)
        .build()
        .map_err(|err| format!("no se pudo crear el cliente HTTP: {err}"))?;

    let mut builder = client.post(&url).json(&body);
    if let Some(reference) = &provider.api_key_env {
        match secrets::get_secret(reference)? {
            Some(key) => builder = builder.bearer_auth(key),
            None if provider.kind == AiProviderKind::OpenAi => {
                return Err(format!(
                    "falta la clave de API para «{}». Guárdala en Ajustes → Asistente IA.",
                    provider.label
                ))
            }
            None => {}
        }
    }

    let response = builder
        .send()
        .await
        .map_err(|err| format!("no se pudo conectar con {url}: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        let detail = detail.chars().take(300).collect::<String>();
        return Err(format!("{url} respondió {status}: {detail}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut finished = false;

    while let Some(chunk) = stream.next().await {
        if cancelled.load(Ordering::Relaxed) {
            break;
        }

        let bytes = chunk.map_err(|err| format!("error leyendo el flujo: {err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Se procesan solo las líneas completas; el resto queda en el buffer.
        while let Some(index) = buffer.find('\n') {
            let line: String = buffer.drain(..=index).collect();
            let delta = match provider.kind {
                AiProviderKind::Ollama => parse_ollama_line(&line),
                AiProviderKind::OpenAi => parse_sse_line(&line),
            };
            if let Some(delta) = delta {
                if !delta.content.is_empty() {
                    let _ = app.emit(
                        "ai://chunk",
                        AiChunk {
                            session_id: request.session_id.clone(),
                            delta: delta.content,
                            done: false,
                            error: None,
                        },
                    );
                }
                if delta.done {
                    finished = true;
                    break;
                }
            }
        }

        if finished {
            break;
        }
    }

    let _ = app.emit(
        "ai://chunk",
        AiChunk {
            session_id: request.session_id.clone(),
            delta: String::new(),
            done: true,
            error: None,
        },
    );
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Pruebas                                                                    */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ollama_line() {
        let delta = parse_ollama_line(r#"{"message":{"role":"assistant","content":"Hola"},"done":false}"#)
            .expect("debería devolver contenido");
        assert_eq!(delta.content, "Hola");
        assert!(!delta.done);

        let last = parse_ollama_line(r#"{"message":{"content":""},"done":true}"#)
            .expect("el cierre también cuenta");
        assert!(last.done);
        assert!(last.content.is_empty());

        // Una línea de control sin contenido y sin cierre no aporta nada.
        assert!(parse_ollama_line(r#"{"model":"x","created_at":"ahora"}"#).is_none());
        assert!(parse_ollama_line("").is_none());
        assert!(parse_ollama_line("no es json").is_none());
    }

    #[test]
    fn test_parse_sse_chunk() {
        let delta = parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Mun"}}]}"#)
            .expect("debería devolver contenido");
        assert_eq!(delta.content, "Mun");
        assert!(!delta.done);

        assert!(parse_sse_line("data: [DONE]").expect("marca el final").done);

        // Líneas que no son datos se ignoran.
        assert!(parse_sse_line("").is_none());
        assert!(parse_sse_line(": keep-alive").is_none());
        assert!(parse_sse_line(r#"data: {"choices":[{"delta":{}}]}"#).is_none());
        assert!(parse_sse_line("data: {roto").is_none());
    }

    #[test]
    fn test_build_chat_body() {
        let messages = [AiMessage {
            role: "user".to_string(),
            content: "hola".to_string(),
        }];

        let ollama = build_chat_body(AiProviderKind::Ollama, "qwen3-local:8b", &messages, 0.2, 512);
        assert_eq!(ollama["model"], "qwen3-local:8b");
        assert_eq!(ollama["stream"], true);
        // `f32` no representa 0.2 exactamente: se compara con tolerancia.
        let temperatura = ollama["options"]["temperature"].as_f64().unwrap();
        assert!((temperatura - 0.2).abs() < 1e-6, "temperatura {temperatura}");
        assert_eq!(ollama["options"]["num_predict"], 512);
        assert!(ollama.get("temperature").is_none(), "Ollama no lo quiere en la raíz");

        let openai = build_chat_body(AiProviderKind::OpenAi, "deepseek-chat", &messages, 0.7, 0);
        let temperatura = openai["temperature"].as_f64().unwrap();
        assert!((temperatura - 0.7).abs() < 1e-6, "temperatura {temperatura}");
        assert!(
            openai.get("max_tokens").is_none(),
            "sin tope no se manda el campo"
        );
        assert!(openai.get("options").is_none());

        // Las URLs se componen sin duplicar barras.
        assert_eq!(
            chat_url(AiProviderKind::Ollama, "http://127.0.0.1:11434/"),
            "http://127.0.0.1:11434/api/chat"
        );
        assert_eq!(
            chat_url(AiProviderKind::OpenAi, "https://api.deepseek.com/v1"),
            "https://api.deepseek.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_ai_config_defaults() {
        let config = AiConfig::default();
        assert_eq!(config.active_id, "ollama");
        assert_eq!(config.providers.len(), 3);
        // El proveedor local no necesita clave; los remotos sí.
        let ollama = config.providers.iter().find(|p| p.id == "ollama").unwrap();
        assert!(ollama.api_key_env.is_none());
        let deepseek = config.providers.iter().find(|p| p.id == "deepseek").unwrap();
        assert_eq!(deepseek.api_key_env.as_deref(), Some("DEEPSEEK_API_KEY"));
    }

    /// Conversación real contra Ollama. Se omite si no está levantado.
    #[tokio::test]
    async fn test_ai_chat_real() {
        if reqwest::Client::new()
            .get("http://127.0.0.1:11434/api/version")
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .is_err()
        {
            eprintln!("Ollama no está levantado; prueba omitida");
            return;
        }

        // Se comprueba el parseo contra una respuesta real del servidor, que es
        // lo que de verdad puede romperse (formato de línea, campos…).
        let client = reqwest::Client::new();
        let body = build_chat_body(
            AiProviderKind::Ollama,
            "qwen3-local:8b",
            &[AiMessage {
                role: "user".to_string(),
                content: "Responde solo con la palabra: ok".to_string(),
            }],
            0.0,
            // Qwen3 gasta parte del presupuesto en razonar antes de responder.
            256,
        );

        let response = client
            .post(chat_url(AiProviderKind::Ollama, "http://127.0.0.1:11434"))
            .json(&body)
            .send()
            .await
            .expect("petición a Ollama");

        assert!(response.status().is_success(), "Ollama respondió {}", response.status());

        let text = response.text().await.expect("cuerpo de la respuesta");
        let mut juntado = String::new();
        let mut razonamiento = String::new();
        for line in text.lines() {
            if let Some(delta) = parse_ollama_line(line) {
                juntado.push_str(&delta.content);
                razonamiento.push_str(&delta.thinking);
            }
        }
        assert!(
            !juntado.trim().is_empty() || !razonamiento.trim().is_empty(),
            "no se extrajo nada del flujo: {text:.200}"
        );
    }
}
