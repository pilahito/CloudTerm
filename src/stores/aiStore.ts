// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { create } from "zustand";
import {
  aiCancel,
  aiChat,
  aiConfigGet,
  aiConfigSet,
  aiModels,
  onAiChunk,
  type AiChunk,
  type AiConfig,
  type AiMessage,
} from "../lib/ai";
import { uid } from "../lib/utils";
import { t } from "../i18n";

interface AiState {
  config: AiConfig | null;
  messages: AiMessage[];
  models: string[];
  /** Identificador de la conversación en curso, o `null` si no hay ninguna. */
  streamId: string | null;
  /** Texto que ya ha llegado del mensaje en curso. */
  streaming: string;
  error: string | null;

  load: () => Promise<void>;
  updateConfig: (patch: Partial<AiConfig>) => Promise<void>;
  setProviderModel: (model: string) => Promise<void>;
  refreshModels: () => Promise<void>;
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  clear: () => void;
  /** Engancha el evento de fragmentos; devuelve la función para soltarlo. */
  listen: () => Promise<() => void>;
  /** Aplica un fragmento recibido. */
  applyChunk: (chunk: AiChunk) => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  config: null,
  messages: [],
  models: [],
  streamId: null,
  streaming: "",
  error: null,

  load: async () => {
    try {
      const config = await aiConfigGet();
      set({ config, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  updateConfig: async (patch) => {
    const current = get().config;
    if (!current) return;
    const next: AiConfig = { ...current, ...patch };
    set({ config: next });
    try {
      await aiConfigSet(next);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  setProviderModel: async (model) => {
    const config = get().config;
    if (!config) return;
    const providers = config.providers.map((provider) =>
      provider.id === config.activeId ? { ...provider, model } : provider,
    );
    await get().updateConfig({ providers });
  },

  refreshModels: async () => {
    const config = get().config;
    if (!config) return;
    try {
      const models = await aiModels(config.activeId);
      set({ models, error: null });
    } catch (err) {
      // No poder listar modelos no impide escribir uno a mano.
      set({ models: [], error: err instanceof Error ? err.message : String(err) });
    }
  },

  send: async (text) => {
    const { config, messages, streamId } = get();
    if (!config || streamId) return;

    const provider = config.providers.find((item) => item.id === config.activeId);
    if (!provider) {
      set({ error: t("ai.noActiveProvider") });
      return;
    }
    if (!provider.model.trim()) {
      set({ error: t("ai.chooseModel") });
      return;
    }

    const conversation: AiMessage[] = [
      ...(config.systemPrompt.trim()
        ? [{ role: "system" as const, content: config.systemPrompt.trim() }]
        : []),
      ...messages,
      { role: "user", content: text },
    ];

    const sessionId = uid("ai");
    set({
      messages: [...messages, { role: "user", content: text }],
      streamId: sessionId,
      streaming: "",
      error: null,
    });

    try {
      await aiChat({
        sessionId,
        providerId: provider.id,
        model: provider.model,
        messages: conversation,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, streamId: null, streaming: "" });
    }
  },

  cancel: async () => {
    const { streamId } = get();
    if (!streamId) return;
    try {
      await aiCancel(streamId);
    } catch {
      /* da igual: el flujo terminará solo */
    }
  },

  clear: () => set({ messages: [], streaming: "", error: null }),

  listen: async () => {
    const stop = await onAiChunk((chunk) => get().applyChunk(chunk));
    return () => stop?.();
  },

  applyChunk: (chunk) => {
    // Se ignoran los fragmentos de otra conversación.
    if (chunk.sessionId !== get().streamId) return;

    if (chunk.delta) {
      set((state) => ({ streaming: state.streaming + chunk.delta }));
    }

    if (chunk.done) {
      const text = get().streaming;
      set((state) => ({
        messages: text.trim()
          ? [...state.messages, { role: "assistant", content: text }]
          : state.messages,
        streaming: "",
        streamId: null,
        error: chunk.error ?? state.error,
      }));
    }
  },
}));
