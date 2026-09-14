import { create } from "zustand";
import type { Connection, TabStatus } from "../types";
import type { SshAuthSpec } from "../lib/ssh";

/** Petición de credenciales pendiente de que el usuario responda. */
export interface PendingAuth {
  sessionId: string;
  connection: Connection;
  /** Motivo por el que se vuelve a preguntar (si es un reintento). */
  hint?: string;
  /** Número de intento, para no preguntar indefinidamente. */
  attempt: number;
  resolve: (auth: SshAuthSpec | null) => void;
}

interface SshState {
  /** Estado de cada sesión, indexado por id de pestaña. */
  status: Record<string, TabStatus>;
  message: Record<string, string>;
  pendingAuth: PendingAuth | null;

  setStatus: (sessionId: string, status: TabStatus, message?: string) => void;
  forget: (sessionId: string) => void;
  /** Abre el modal de credenciales y espera la respuesta del usuario. */
  requestCredentials: (
    sessionId: string,
    connection: Connection,
    hint?: string,
  ) => Promise<SshAuthSpec | null>;
  resolveCredentials: (auth: SshAuthSpec | null) => void;
}

export const useSshStore = create<SshState>((set, get) => ({
  status: {},
  message: {},
  pendingAuth: null,

  setStatus: (sessionId, status, message) =>
    set((state) => ({
      status: { ...state.status, [sessionId]: status },
      message: message
        ? { ...state.message, [sessionId]: message }
        : Object.fromEntries(Object.entries(state.message).filter(([key]) => key !== sessionId)),
    })),

  forget: (sessionId) =>
    set((state) => {
      const status = { ...state.status };
      const message = { ...state.message };
      delete status[sessionId];
      delete message[sessionId];
      return { status, message };
    }),

  requestCredentials: (sessionId, connection, hint) => {
    // Si ya había una petición abierta, se cancela para no dejar promesas colgadas.
    get().pendingAuth?.resolve(null);

    const attempt = (get().pendingAuth?.attempt ?? 0) + 1;

    return new Promise<SshAuthSpec | null>((resolve) => {
      set({
        pendingAuth: {
          sessionId,
          connection,
          hint,
          attempt,
          resolve: (auth) => {
            set({ pendingAuth: null });
            resolve(auth);
          },
        },
      });
    });
  },

  resolveCredentials: (auth) => {
    get().pendingAuth?.resolve(auth);
  },
}));
