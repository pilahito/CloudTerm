// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { create } from "zustand";
import {
  knownHostsDecide,
  type HostKeyPrompt,
} from "../lib/knownHosts";

interface HostKeyState {
  /** Avisos pendientes, en orden de llegada. */
  prompts: HostKeyPrompt[];
  push: (prompt: HostKeyPrompt) => void;
  /** Responde al aviso y lo retira de la cola. */
  resolve: (requestId: string, accept: boolean, remember: boolean) => Promise<void>;
  /** Descarta un aviso sin responder (el handshake aplicará su política). */
  dismiss: (requestId: string) => void;
}

export const useHostKeyStore = create<HostKeyState>((set, get) => ({
  prompts: [],

  push: (prompt) =>
    set((state) =>
      // Un mismo host no puede estar dos veces en la cola.
      state.prompts.some((item) => item.requestId === prompt.requestId)
        ? state
        : { prompts: [...state.prompts, prompt] },
    ),

  resolve: async (requestId, accept, remember) => {
    try {
      await knownHostsDecide(requestId, accept, remember);
    } catch (err) {
      console.warn("[CloudTerm] no se pudo responder al aviso de clave:", err);
    }
    get().dismiss(requestId);
  },

  dismiss: (requestId) =>
    set((state) => ({ prompts: state.prompts.filter((item) => item.requestId !== requestId) })),
}));
