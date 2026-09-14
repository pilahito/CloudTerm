import { create } from "zustand";
import type { Connection } from "../types";
import { defaultPort } from "../lib/utils";
import { probeHost } from "../lib/ssh";
import {
  hostsCreate,
  hostsDelete,
  hostsImport,
  hostsList,
  hostsTouch,
  hostsUpdate,
  type HostInput,
} from "../lib/hosts";

/** Resultado del último sondeo de un host (solo en memoria). */
export interface HostProbe {
  reachable: boolean;
  latencyMs: number;
  banner: string | null;
  checkedAt: number;
}

/** Datos mínimos para dar de alta una conexión desde la interfaz. */
export interface ConnectionDraft {
  name: string;
  host: string;
  port?: number;
  username?: string;
  protocol?: Connection["protocol"];
  group?: string;
  authMethod?: Connection["authMethod"];
  privateKeyPath?: string;
  useAgent?: boolean;
  timeoutMs?: number;
}

interface ConnectionState {
  connections: Connection[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  selectedId: string | null;
  search: string;
  /** Estado de conectividad por id de host; no se persiste. */
  probes: Record<string, HostProbe>;
  probing: boolean;
  lastProbeAt: number;

  /** Carga los hosts desde SQLite (una vez, al arrancar). */
  load: () => Promise<void>;
  /** Sondea todos los hosts para el árbol y Pixel Agents. */
  refreshStatuses: () => Promise<void>;
  addConnection: (draft: ConnectionDraft) => Promise<Connection | null>;
  updateConnection: (id: string, patch: Partial<Connection>) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  importHosts: (inputs: HostInput[]) => Promise<number>;
  selectConnection: (id: string | null) => void;
  setSearch: (value: string) => void;
  touchConnection: (id: string) => void;
}

export function draftToInput(draft: ConnectionDraft): HostInput {
  const protocol = draft.protocol ?? "ssh";
  return {
    name: draft.name.trim(),
    host: draft.host.trim(),
    port: draft.port ?? defaultPort(protocol),
    username: draft.username?.trim() ?? "",
    protocol,
    group: draft.group?.trim() || "General",
    authMethod: draft.authMethod ?? "key",
    privateKeyPath: draft.privateKeyPath ?? "",
    useAgent: draft.useAgent ?? false,
    timeoutMs: draft.timeoutMs ?? 60_000,
  };
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  loading: false,
  loaded: false,
  error: null,
  selectedId: null,
  search: "",
  probes: {},
  probing: false,
  lastProbeAt: 0,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const connections = await hostsList();
      set({ connections, loaded: true, loading: false });
    } catch (err) {
      // Fuera de Tauri (dev server en el navegador) `invoke` no existe.
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  refreshStatuses: async () => {
    const targets = get().connections;
    if (targets.length === 0 || get().probing) return;

    set({ probing: true });
    const probes: Record<string, HostProbe> = {};

    // Sondeo por lotes: lanzar cientos de conexiones TCP a la vez satura el
    // resolver y falsea las latencias que se muestran al usuario.
    const LANES = 6;
    for (let start = 0; start < targets.length; start += LANES) {
      const batch = targets.slice(start, start + LANES);
      const results = await Promise.all(
        batch.map(async (connection) => {
          try {
            const result = await probeHost(connection.host, connection.port, 4000);
            return {
              id: connection.id,
              probe: {
                reachable: result.reachable,
                latencyMs: result.latencyMs,
                banner: result.banner,
                checkedAt: Date.now(),
              },
            };
          } catch {
            return {
              id: connection.id,
              probe: { reachable: false, latencyMs: 0, banner: null, checkedAt: Date.now() },
            };
          }
        }),
      );
      for (const item of results) probes[item.id] = item.probe;
    }

    set((state) => ({
      probes: { ...state.probes, ...probes },
      probing: false,
      lastProbeAt: Date.now(),
    }));
  },

  addConnection: async (draft) => {
    try {
      const created = await hostsCreate(draftToInput(draft));
      set((state) => ({ connections: [...state.connections, created], error: null }));
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  updateConnection: async (id, patch) => {
    // Actualización optimista: la interfaz responde ya y la base confirma después.
    const previous = get().connections;
    const merged = previous.map((c) => (c.id === id ? { ...c, ...patch } : c));
    set({ connections: merged });

    const target = merged.find((c) => c.id === id);
    if (!target) return;

    try {
      await hostsUpdate(target);
      set({ error: null });
    } catch (err) {
      // Si la base rechaza el cambio, se restaura el estado anterior.
      set({
        connections: previous,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  removeConnection: async (id) => {
    const previous = get().connections;
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));

    try {
      await hostsDelete(id);
      set({ error: null });
    } catch (err) {
      set({ connections: previous, error: err instanceof Error ? err.message : String(err) });
    }
  },

  importHosts: async (inputs) => {
    try {
      const created = await hostsImport(inputs);
      if (created.length > 0) {
        set((state) => ({ connections: [...state.connections, ...created], error: null }));
        void get().refreshStatuses();
      }
      return created.length;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  },

  selectConnection: (id) => set({ selectedId: id }),

  setSearch: (value) => set({ search: value }),

  touchConnection: (id) => {
    const now = Date.now();
    set((state) => ({
      connections: state.connections.map((c) => (c.id === id ? { ...c, lastUsedAt: now } : c)),
    }));
    void hostsTouch(id).catch(() => {
      /* el marcado de uso no es crítico */
    });
  },
}));
