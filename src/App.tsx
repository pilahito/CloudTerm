import { useEffect, useRef } from "react";
import { Terminal as TerminalIcon, Plus, Command } from "lucide-react";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { ActivityBar } from "./components/ActivityBar";
import { StatusBar } from "./components/StatusBar";
import { WelcomeScreen } from "./components/Welcome";
import { PixelAgents } from "./components/PixelAgents";
import { CommandPalette } from "./components/CommandPalette";
import { Settings } from "./components/Settings";
import { SFTPPanel } from "./components/SFTP";
import { AIPanel } from "./components/AI";
import { About } from "./components/About";
import { DonateModal } from "./components/Donate";
import { SshAuthModal, HostKeyDialog } from "./components/SshAuth";
import { ImportSshConfig, NewHostDialog, HostSettingsDialog } from "./components/Hosts";
import { ToastContainer } from "./components/Toast";
import { useTabStore } from "./stores/tabStore";
import { useUiStore } from "./stores/uiStore";
import { useConnectionStore } from "./stores/connectionStore";
import { useTerminal } from "./hooks/useTerminal";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDonationUnlock } from "./hooks/useDonationUnlock";
import { useTheme } from "./hooks/useTheme";
import type { Tab } from "./types";
import { cx } from "./lib/utils";
import { useDocumentLanguage } from "./i18n";

function TerminalView({ tab }: { tab: Tab }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const connection = useConnectionStore((s) =>
    tab.connectionId ? s.connections.find((c) => c.id === tab.connectionId) : undefined,
  );

  const label = connection
    ? `${connection.username}@${connection.host}:${connection.port}`
    : "Shell local";

  useTerminal(hostRef, { sessionId: tab.id, label, connection });

  return <div ref={hostRef} className="ct-terminal-host" />;
}

export default function App() {
  useTheme();
  useKeyboardShortcuts();
  useDonationUnlock();
  // Mantiene el `lang` del documento al día: afecta a fuentes y a lectores de
  // pantalla, y no se actualiza solo.
  useDocumentLanguage();

  const loadConnections = useConnectionStore((s) => s.load);

  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const openTab = useTabStore((s) => s.openTab);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const activeView = useUiStore((s) => s.activeView);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);

  // Los hosts viven en SQLite: se cargan al arrancar y se sondean una vez para
  // que el árbol y Pixel Agents arranquen con datos reales.
  useEffect(() => {
    void loadConnections().then(() => {
      void useConnectionStore.getState().refreshStatuses();
    });
  }, [loadConnections]);

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        {sidebarOpen && <Sidebar />}

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/*
            El terminal se mantiene montado aunque no sea la vista activa: si se
            desmontara, se caerían las sesiones SSH abiertas.
          */}
          <div
            className={cx(
              "min-h-0 flex-1 flex-col",
              activeView === "terminal" ? "flex" : "hidden",
            )}
          >
            <TabBar />

            <div className="relative min-h-0 flex-1">
              {tabs.length === 0 && (
                <div className="grid h-full place-items-center">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <TerminalIcon size={28} className="text-muted" />
                    <p className="text-xs text-muted">
                      No hay pestañas abiertas.
                      <br />
                      Abre una terminal o conecta un servidor.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openTab({ kind: "terminal" })}
                        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accentfg transition-opacity hover:opacity-90"
                      >
                        <Plus size={13} /> Nueva terminal
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
                      >
                        <Command size={13} /> Paleta
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cx("absolute inset-0", tab.id === activeTabId ? "block" : "hidden")}
                >
                  {tab.kind === "sftp" ? <SFTPPanel /> : <TerminalView tab={tab} />}
                </div>
              ))}
            </div>
          </div>

          {/* Archivos: también se mantiene montado para no cerrar la sesión SFTP */}
          <div className={cx("min-h-0 flex-1", activeView === "files" ? "flex" : "hidden")}>
            <SFTPPanel />
          </div>

          {activeView === "welcome" && <WelcomeScreen />}
          {activeView === "pixel" && <PixelAgents />}
        </main>

        {rightPanel && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
            {rightPanel === "sftp" && <SFTPPanel />}
            {rightPanel === "ai" && <AIPanel />}
            {rightPanel === "pixel" && <PixelAgents compact />}
          </aside>
        )}
      </div>

      <StatusBar />

      <CommandPalette />
      <Settings />
      <About />
      <DonateModal />
      <SshAuthModal />
      <HostKeyDialog />
      <ImportSshConfig />
      <NewHostDialog />
      <HostSettingsDialog />
      <ToastContainer />
    </div>
  );
}
