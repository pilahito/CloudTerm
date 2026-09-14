/**
 * Puente con el transporte de IA del backend.
 *
 * La conversación llega por el evento `ai://chunk`: cada fragmento trae su
 * `sessionId`, así que varias conversaciones no se pisan.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AiProviderKind = "ollama" | "openai";

export interface AiProviderConfig {
  id: string;
  label: string;
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  /** Nombre de la entrada del llavero; `null` si el proveedor no usa clave. */
  apiKeyEnv: string | null;
}

export interface AiConfig {
  providers: AiProviderConfig[];
  activeId: string;
  temperature: number;
  systemPrompt: string;
  maxTokens: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChunk {
  sessionId: string;
  delta: string;
  done: boolean;
  error: string | null;
}

export interface AiChatRequest {
  sessionId: string;
  providerId: string;
  model: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
}

export function aiConfigGet(): Promise<AiConfig> {
  return invoke<AiConfig>("ai_config_get");
}

export function aiConfigSet(config: AiConfig): Promise<void> {
  return invoke("ai_config_set", { config });
}

export function aiSetApiKey(reference: string, value: string): Promise<void> {
  return invoke("ai_set_api_key", { reference, value });
}

export function aiHasApiKey(reference: string): Promise<boolean> {
  return invoke<boolean>("ai_has_api_key", { reference });
}

export function aiModels(providerId: string): Promise<string[]> {
  return invoke<string[]>("ai_models", { providerId });
}

export function aiTestProvider(providerId: string): Promise<string> {
  return invoke<string>("ai_test_provider", { providerId });
}

export function aiChat(request: AiChatRequest): Promise<void> {
  return invoke("ai_chat", { request });
}

export function aiCancel(sessionId: string): Promise<boolean> {
  return invoke<boolean>("ai_cancel", { sessionId });
}

export async function onAiChunk(handler: (chunk: AiChunk) => void): Promise<UnlistenFn | null> {
  try {
    return await listen<AiChunk>("ai://chunk", (event) => handler(event.payload));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Markdown ligero                                                            */
/* -------------------------------------------------------------------------- */

export type MdBlock =
  | { kind: "text"; text: string }
  | { kind: "code"; language: string; code: string };

/**
 * Parte el texto en bloques de prosa y de código.
 *
 * No pretende ser un parser de Markdown completo: cubre lo que devuelven los
 * modelos cuando explican comandos, que son bloques cercados y prosa.
 */
export function splitMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.split("\n");
  let buffer: string[] = [];
  let code: string[] | null = null;
  let language = "";

  const flushText = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: "text", text: buffer.join("\n") });
      buffer = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      if (code === null) {
        flushText();
        code = [];
        language = fence[1] ?? "";
      } else {
        blocks.push({ kind: "code", language, code: code.join("\n") });
        code = null;
        language = "";
      }
      continue;
    }
    if (code === null) buffer.push(line);
    else code.push(line);
  }

  // Un bloque sin cerrar se muestra como código igualmente: es mejor que
  // perder lo que el modelo ya había escrito.
  if (code !== null) blocks.push({ kind: "code", language, code: code.join("\n") });
  flushText();
  return blocks;
}
