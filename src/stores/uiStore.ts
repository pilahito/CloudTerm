// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { create } from "zustand";
import type { ToastKind, ToastMessage } from "../types";
import { uid } from "../lib/utils";

/** Vista principal que ocupa el área central. */
export type ViewId = "welcome" | "terminal" | "files" | "pixel";

/** Panel acoplado a la derecha. */
export type RightPanel = "sftp" | "ai" | "pixel" | null;

interface UiState {
  sidebarOpen: boolean;
  activeView: ViewId;
  rightPanel: RightPanel;
  paletteOpen: boolean;
  settingsOpen: boolean;
  aboutOpen: boolean;
  donateOpen: boolean;
  updateOpen: boolean;
  tourOpen: boolean;
  importOpen: boolean;
  newHostOpen: boolean;
  /** Host cuyas propiedades se están editando, o `null` si no hay diálogo. */
  hostSettingsId: string | null;
  /** Grupos del árbol de hosts que están contraídos. */
  collapsedGroups: string[];
  toasts: ToastMessage[];

  toggleSidebar: (value?: boolean) => void;
  setActiveView: (view: ViewId) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: Exclude<RightPanel, null>) => void;
  toggleGroup: (group: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setDonateOpen: (open: boolean) => void;
  setUpdateOpen: (open: boolean) => void;
  setTourOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setNewHostOpen: (open: boolean) => void;
  setHostSettingsId: (id: string | null) => void;

  pushToast: (kind: ToastKind, title: string, description?: string) => string;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: true,
  activeView: "welcome",
  rightPanel: null,
  paletteOpen: false,
  settingsOpen: false,
  aboutOpen: false,
  donateOpen: false,
  updateOpen: false,
  tourOpen: false,
  importOpen: false,
  newHostOpen: false,
  hostSettingsId: null,
  collapsedGroups: [],
  toasts: [],

  toggleSidebar: (value) => set((state) => ({ sidebarOpen: value ?? !state.sidebarOpen })),
  setActiveView: (view) => set({ activeView: view }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set((state) => ({ rightPanel: state.rightPanel === panel ? null : panel })),
  toggleGroup: (group) =>
    set((state) => ({
      collapsedGroups: state.collapsedGroups.includes(group)
        ? state.collapsedGroups.filter((item) => item !== group)
        : [...state.collapsedGroups, group],
    })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setAboutOpen: (open) => set({ aboutOpen: open }),
  setDonateOpen: (open) => set({ donateOpen: open }),
  setUpdateOpen: (open) => set({ updateOpen: open }),
  setTourOpen: (open) => set({ tourOpen: open }),
  setImportOpen: (open) => set({ importOpen: open }),
  setNewHostOpen: (open) => set({ newHostOpen: open }),
  setHostSettingsId: (id) => set({ hostSettingsId: id }),

  pushToast: (kind, title, description) => {
    const id = uid("toast");
    set((state) => ({ toasts: [...state.toasts, { id, kind, title, description }] }));
    // El aviso de desbloqueo dura algo más: lleva un botón que apetece pulsar.
    const duration = kind === "error" ? 8000 : kind === "unlock" ? 5000 : 4500;
    window.setTimeout(() => get().dismissToast(id), duration);
    return id;
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
