// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect } from "react";
import { useTabStore } from "../stores/tabStore";
import { useUiStore } from "../stores/uiStore";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Atajos globales.
 *
 * Ctrl/Cmd+K  paleta de comandos    Ctrl/Cmd+T  nueva terminal
 * Ctrl/Cmd+W  cerrar pestaña        Ctrl/Cmd+B  barra lateral
 * Ctrl/Cmd+,  ajustes               Ctrl/Cmd+1..4  cambiar de vista
 */
export function useKeyboardShortcuts() {
  const openTab = useTabStore((s) => s.openTab);
  const closeTab = useTabStore((s) => s.closeTab);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      const activeTabId = useTabStore.getState().activeTabId;

      switch (key) {
        case "1":
        case "2":
        case "3":
        case "4": {
          event.preventDefault();
          const views = ["welcome", "terminal", "files", "pixel"] as const;
          useUiStore.getState().setActiveView(views[Number(key) - 1]);
          break;
        }
        case "k":
          event.preventDefault();
          useUiStore.getState().setPaletteOpen(true);
          break;
        case "p":
          if (event.shiftKey) {
            event.preventDefault();
            useUiStore.getState().setPaletteOpen(true);
          }
          break;
        case "t":
          event.preventDefault();
          openTab({ kind: "terminal" });
          break;
        case "w":
          if (activeTabId) {
            event.preventDefault();
            closeTab(activeTabId);
          }
          break;
        case "b":
          event.preventDefault();
          useUiStore.getState().toggleSidebar();
          break;
        case ",":
          event.preventDefault();
          useUiStore.getState().setSettingsOpen(true);
          break;
        case "=":
        case "+": {
          event.preventDefault();
          const { settings, update } = useSettingsStore.getState();
          update({ fontSize: Math.min(28, settings.fontSize + 1) });
          break;
        }
        case "-": {
          event.preventDefault();
          const { settings, update } = useSettingsStore.getState();
          update({ fontSize: Math.max(9, settings.fontSize - 1) });
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openTab, closeTab]);
}
