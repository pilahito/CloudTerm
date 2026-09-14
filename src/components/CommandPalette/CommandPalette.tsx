// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, CornerDownLeft } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { useTabStore } from "../../stores/tabStore";
import { useSettingsStore, THEMES } from "../../stores/settingsStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEasterEggStore } from "../../stores/easterEggStore";
import type { CommandAction } from "../../types";
import { cx, fuzzyMatch } from "../../lib/utils";
import { useT } from "../../i18n";

export function CommandPalette() {
  const t = useT();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const account = useAuthStore((s) => s.account);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const setDonateOpen = useUiStore((s) => s.setDonateOpen);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const setNewHostOpen = useUiStore((s) => s.setNewHostOpen);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const pushToast = useUiStore((s) => s.pushToast);

  const openTab = useTabStore((s) => s.openTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const closeAll = useTabStore((s) => s.closeAll);
  const setActiveTab = useTabStore((s) => s.setActiveTab);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const connections = useConnectionStore((s) => s.connections);
  const touchConnection = useConnectionStore((s) => s.touchConnection);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const actions = useMemo<CommandAction[]>(() => {
    const base: CommandAction[] = [
      {
        id: "view.welcome",
        label: t("palette.action.goWelcome"),
        hint: "Ctrl+1",
        keywords: `${t("palette.keywords.goWelcome")} inicio home bienvenida welcome`,
        run: () => setActiveView("welcome"),
      },
      {
        id: "view.terminal",
        label: t("palette.action.goTerminal"),
        hint: "Ctrl+2",
        keywords: `${t("palette.keywords.goTerminal")} terminales terminal tabs`,
        run: () => setActiveView("terminal"),
      },
      {
        id: "view.files",
        label: t("palette.action.goFiles"),
        hint: "Ctrl+3",
        keywords: `${t("palette.keywords.goFiles")} archivos ficheros sftp paneles`,
        run: () => setActiveView("files"),
      },
      {
        id: "view.pixel",
        label: t("palette.action.goPixel"),
        hint: "Ctrl+4",
        keywords: `${t("palette.keywords.goPixel")} pixel agents agentes isometrico escritorio flota`,
        run: () => {
          if (useEasterEggStore.getState().npcsUnlocked) {
            setActiveView("pixel");
            return;
          }
          pushToast("warning", t("palette.locked"), t("palette.lockedBody"));
        },
      },
      {
        id: "host.new",
        label: t("palette.action.newHost"),
        keywords: `${t("palette.keywords.newHost")} nuevo host conexion servidor guardar`,
        run: () => setNewHostOpen(true),
      },
      {
        id: "tab.new",
        label: t("palette.action.newTerminalTab"),
        hint: "Ctrl+T",
        keywords: `${t("palette.keywords.newTab")} nueva terminal tab shell`,
        run: () => {
          openTab({ kind: "terminal" });
          setActiveView("terminal");
        },
      },
      {
        id: "tab.close",
        label: t("palette.action.closeTab"),
        hint: "Ctrl+W",
        keywords: `${t("palette.keywords.closeTab")} cerrar tab`,
        run: () => {
          const id = useTabStore.getState().activeTabId;
          if (id) closeTab(id);
        },
      },
      {
        id: "tab.closeAll",
        label: t("palette.action.closeAllTabs"),
        keywords: `${t("palette.keywords.closeAllTabs")} cerrar todo`,
        run: () => closeAll(),
      },
      {
        id: "view.sidebar",
        label: t("palette.action.toggleSidebar"),
        hint: "Ctrl+B",
        keywords: `${t("palette.keywords.toggleSidebar")} sidebar panel conexiones`,
        run: () => toggleSidebar(),
      },
      {
        id: "view.sftp",
        label: t("palette.action.toggleSftp"),
        keywords: `${t("palette.keywords.toggleSftp")} sftp archivos ficheros`,
        run: () => toggleRightPanel("sftp"),
      },
      {
        id: "view.ai",
        label: t("palette.action.toggleAi"),
        keywords: `${t("palette.keywords.toggleAi")} ia ai asistente chat`,
        run: () => toggleRightPanel("ai"),
      },
      {
        id: "app.settings",
        label: t("palette.action.openSettings"),
        hint: "Ctrl+,",
        keywords: `${t("palette.keywords.openSettings")} preferencias config`,
        run: () => setSettingsOpen(true),
      },
      {
        // La sección de Cuenta vive dentro de Ajustes; esta acción existe para
        // que se pueda llegar a ella escribiendo «sesión» o «google».
        id: "app.account",
        label: t(account ? "account.signedInAction" : "account.signIn"),
        keywords: `${t("palette.keywords.account")} login google github sesion sync copia`,
        run: () => setSettingsOpen(true),
      },
      {
        id: "app.about",
        label: t("palette.action.about"),
        keywords: `${t("palette.keywords.about")} about licencia version`,
        run: () => setAboutOpen(true),
      },
      ...(import.meta.env.DEV
        ? [
            {
              id: "dev.unlock",
              label: t("palette.action.devUnlock"),
              keywords: `${t("palette.keywords.devUnlock")} dev easter egg desbloquear pixel agents debug`,
              run: () => {
                useEasterEggStore.getState().unlockNow();
                pushToast("success", t("palette.unlockedTitle"), t("palette.unlockedBody"));
              },
            },
          ]
        : []),
      {
        id: "app.donate",
        label: t("palette.action.donate"),
        keywords: `${t("palette.keywords.donate")} donar donativo donacion cafe coffee paypal apoyar`,
        run: () => setDonateOpen(true),
      },
      {
        id: "hosts.import",
        label: t("palette.action.importHosts"),
        keywords: `${t("palette.keywords.importHosts")} importar ssh config hosts conexiones`,
        run: () => setImportOpen(true),
      },
      ...THEMES.map<CommandAction>((theme) => ({
        id: `theme.${theme.id}`,
        label: t("palette.themePrefix", { name: theme.label }),
        keywords: `${t("palette.keywords.theme")} tema theme color ${theme.id}`,
        run: () => {
          setTheme(theme.id);
          pushToast("success", t("palette.themeAppliedTitle"), theme.label);
        },
      })),
      ...connections.map<CommandAction>((c) => ({
        id: `connect.${c.id}`,
        label: t("palette.action.connect", { name: c.name }),
        hint: `${c.username}@${c.host}`,
        keywords: `${t("palette.keywords.connect")} conectar ssh sftp ${c.host} ${c.username}`,
        run: () => {
          const tab = openTab({
            kind: c.protocol === "sftp" ? "sftp" : "terminal",
            connectionId: c.id,
            title: c.name,
          });
          touchConnection(c.id);
          setActiveTab(tab.id);
        },
      })),
    ];
    return base;
  }, [
    t,
    openTab,
    closeTab,
    closeAll,
    toggleSidebar,
    toggleRightPanel,
    setSettingsOpen,
    setAboutOpen,
    setDonateOpen,
    setImportOpen,
    setNewHostOpen,
    setActiveView,
    setTheme,
    pushToast,
    account,
    connections,
    touchConnection,
    setActiveTab,
  ]);

  const results = useMemo(
    () => actions.filter((a) => fuzzyMatch(query, `${a.label} ${a.keywords ?? ""}`)),
    [actions, query],
  );

  const close = () => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  };

  const runAction = (action: CommandAction | undefined) => {
    if (!action) return;
    action.run();
    close();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-elevated shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Search size={15} className="text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    runAction(results[cursor]);
                  }
                }}
                placeholder={t("palette.placeholder")}
                className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
              />
              <kbd className="rounded border border-border px-1 py-0.5 text-[10px] text-muted">
                Esc
              </kbd>
            </div>

            <ul className="max-h-[46vh] overflow-y-auto p-1.5">
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted">{t("palette.noResults")}</li>
              )}
              {results.map((action, index) => (
                <li key={action.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runAction(action)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors",
                      index === cursor ? "bg-accent/15 text-text" : "text-muted hover:bg-border/40",
                    )}
                  >
                    <span className="flex-1 truncate">{action.label}</span>
                    {action.hint && (
                      <span className="shrink-0 text-[10px] text-muted">{action.hint}</span>
                    )}
                    {index === cursor && <CornerDownLeft size={12} className="text-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
