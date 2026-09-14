// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { create } from "zustand";
import type { Tab, TabKind } from "../types";
import { uid } from "../lib/utils";
import { t } from "../i18n";

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (options?: { kind?: TabKind; connectionId?: string | null; title?: string }) => Tab;
  closeTab: (id: string) => void;
  closeAll: () => void;
  setActiveTab: (id: string) => void;
  setTabStatus: (id: string, status: Tab["status"], error?: string) => void;
  renameTab: (id: string, title: string) => void;
  /** Convierte una pestaña local en una sesión SSH/SFTP (por ejemplo al escribir `ssh host`). */
  setTabConnection: (id: string, connectionId: string, title?: string) => void;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [
    {
      id: "tab-local-1",
      title: t("terminal.localShell"),
      kind: "terminal",
      connectionId: null,
      status: "idle",
    },
  ],
  activeTabId: "tab-local-1",

  openTab: (options) => {
    const kind = options?.kind ?? "terminal";
    const tab: Tab = {
      id: uid("tab"),
      title:
        options?.title ??
        (kind === "sftp" ? "SFTP" : options?.connectionId ? "SSH" : t("terminal.localShell")),
      kind,
      connectionId: options?.connectionId ?? null,
      status: "idle",
    };
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
    return tab;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    const next = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      nextActive = next.length ? next[Math.min(index, next.length - 1)].id : null;
    }
    set({ tabs: next, activeTabId: nextActive });
  },

  closeAll: () => set({ tabs: [], activeTabId: null }),

  setActiveTab: (id) => set({ activeTabId: id }),

  setTabStatus: (id, status, error) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, status, error } : t)),
    })),

  renameTab: (id, title) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setTabConnection: (id, connectionId, title) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? { ...t, connectionId, title: title ?? t.title, status: "idle", error: undefined }
          : t,
      ),
    })),
}));
