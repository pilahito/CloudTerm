// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { create } from "zustand";
import { uid } from "../lib/utils";
import { sftpCancel, sftpDownload, sftpUpload } from "../lib/sftp";

export type TransferStatus = "queued" | "running" | "done" | "error" | "cancelled";
export type TransferDirection = "upload" | "download";

export interface Transfer {
  id: string;
  /** Sesión SFTP a la que pertenece la transferencia. */
  sessionId: string;
  direction: TransferDirection;
  name: string;
  localPath: string;
  remotePath: string;
  size: number;
  transferred: number;
  status: TransferStatus;
  error?: string;
}

export interface TransferRequest {
  sessionId: string;
  direction: TransferDirection;
  name: string;
  localPath: string;
  remotePath: string;
  size: number;
}

interface TransferState {
  transfers: Transfer[];
  /** Hay una transferencia en curso (la cola es secuencial). */
  running: boolean;
  /** Se incrementa al terminar cada transferencia, para que la UI refresque. */
  completedAt: number;

  enqueue: (requests: TransferRequest[]) => void;
  updateProgress: (transferId: string, transferred: number, total: number, done: boolean) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  clearAll: () => void;
}

export const useTransferStore = create<TransferState>((set, get) => {
  /**
   * Procesa la cola de una en una.
   *
   * Secuencial a propósito: compartir una sola sesión SFTP entre varias
   * transferencias simultáneas multiplica las lecturas en vuelo y dispara los
   * timeouts por petición de `russh-sftp` (10 s por defecto).
   */
  const pump = async () => {
    if (get().running) return;

    const next = get().transfers.find((t) => t.status === "queued");
    if (!next) return;

    set({ running: true });
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === next.id ? { ...t, status: "running", error: undefined } : t,
      ),
    }));

    try {
      if (next.direction === "upload") {
        await sftpUpload(next.sessionId, next.id, next.localPath, next.remotePath);
      } else {
        await sftpDownload(next.sessionId, next.id, next.remotePath, next.localPath);
      }
      set((state) => ({
        transfers: state.transfers.map((t) =>
          t.id === next.id
            ? { ...t, status: "done", transferred: t.size || t.transferred }
            : t,
        ),
        completedAt: Date.now(),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cancelled =
        get().transfers.find((t) => t.id === next.id)?.status === "cancelled" ||
        /cancelad/i.test(message);
      set((state) => ({
        transfers: state.transfers.map((t) =>
          t.id === next.id
            ? {
                ...t,
                status: cancelled ? "cancelled" : "error",
                error: cancelled ? undefined : message,
              }
            : t,
        ),
      }));
    } finally {
      set({ running: false });
      void pump();
    }
  };

  return {
    transfers: [],
    running: false,
    completedAt: 0,

    enqueue: (requests) => {
      if (requests.length === 0) return;
      const created: Transfer[] = requests.map((request) => ({
        ...request,
        id: uid("tr"),
        transferred: 0,
        status: "queued",
      }));
      set((state) => ({ transfers: [...state.transfers, ...created] }));
      void pump();
    },

    updateProgress: (transferId, transferred, total, done) =>
      set((state) => ({
        transfers: state.transfers.map((t) =>
          t.id === transferId && t.status !== "cancelled"
            ? {
                ...t,
                transferred,
                size: total > 0 ? total : t.size,
                status: done ? "done" : "running",
              }
            : t,
        ),
      })),

    cancel: (id) => {
      const item = get().transfers.find((t) => t.id === id);
      if (!item) return;
      if (item.status !== "queued" && item.status !== "running") return;
      set((state) => ({
        transfers: state.transfers.map((t) =>
          t.id === id ? { ...t, status: "cancelled" as const } : t,
        ),
      }));
      if (item.status === "running") {
        void sftpCancel(id).catch(() => {
          /* la transferencia puede haber terminado ya */
        });
      }
      if (item.status === "queued") {
        void pump();
      }
    },

    remove: (id) => {
      const item = get().transfers.find((t) => t.id === id);
      if (item?.status === "running") {
        void sftpCancel(id).catch(() => undefined);
      }
      set((state) => ({ transfers: state.transfers.filter((t) => t.id !== id) }));
    },

    clearFinished: () =>
      set((state) => ({
        transfers: state.transfers.filter(
          (t) => t.status === "queued" || t.status === "running",
        ),
      })),

    clearAll: () => set({ transfers: [] }),
  };
});
