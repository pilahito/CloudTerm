// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Settings, ThemeName } from "../types";

export const THEMES: Array<{ id: ThemeName; label: string }> = [
  { id: "neon", label: "Dark Neon" },
  { id: "midnight", label: "Midnight" },
  { id: "dracula", label: "Dracula" },
  { id: "nord", label: "Nord" },
  { id: "solarized", label: "Solarized Dark" },
  { id: "daylight", label: "Daylight" },
];

const DEFAULT_FONT =
  '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace';
const LEGACY_FONT = '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace';

export const DEFAULT_SETTINGS: Settings = {
  theme: "neon",
  fontSize: 14,
  fontFamily: DEFAULT_FONT,
  cursorBlink: true,
  scrollback: 5000,
  sidebarOpen: true,
  aiEnabled: false,
  aiModel: "deepseek-chat",
  aiEndpoint: "https://api.deepseek.com/v1",
  confirmOnClose: true,
  sounds: true,
  copyOnSelect: false,
  language: "es",
  onboardingDone: false,
};

interface SettingsState {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  setTheme: (theme: ThemeName) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
      setTheme: (theme) => set((state) => ({ settings: { ...state.settings, theme } })),
    }),
    {
      name: "cloudterm.settings",
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as SettingsState;
        if (version < 2 && state.settings?.fontFamily === LEGACY_FONT) {
          state.settings.fontFamily = DEFAULT_FONT;
        }
        return state;
      },
    },
  ),
);
