// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { Home, Terminal, FolderTree, Users, Sparkles, Settings, Info, User } from "lucide-react";
import { useUiStore, type ViewId } from "../../stores/uiStore";
import { useSshStore } from "../../stores/sshStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEasterEggStore } from "../../stores/easterEggStore";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

interface Item {
  id: ViewId;
  labelKey: string;
  icon: React.ReactNode;
}

const ITEMS: Item[] = [
  { id: "welcome", labelKey: "view.welcome", icon: <Home size={18} /> },
  { id: "terminal", labelKey: "view.terminal", icon: <Terminal size={18} /> },
  { id: "files", labelKey: "view.files", icon: <FolderTree size={18} /> },
  { id: "pixel", labelKey: "view.pixel", icon: <Users size={18} /> },
];

/**
 * Riel de iconos de la izquierda, al estilo de un editor: cambia la vista
 * principal y muestra de un vistazo cuántas sesiones hay vivas.
 */
export function ActivityBar() {
  const t = useT();
  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);

  // Pixel Agents es un premio: solo aparece si se ha desbloqueado y el
  // usuario no lo ha ocultado (ni temporalmente ni con el interruptor).
  const npcsUnlocked = useEasterEggStore((s) => s.npcsUnlocked);
  const showNpcs = useEasterEggStore((s) => s.showNpcs);
  const hiddenUntil = useEasterEggStore((s) => s.hiddenUntil);
  const badgeSeen = useEasterEggStore((s) => s.badgeSeen);
  const markBadgeSeen = useEasterEggStore((s) => s.markBadgeSeen);

  const npcsVisible =
    npcsUnlocked && showNpcs && (hiddenUntil === null || Date.now() >= hiddenUntil);

  const statuses = useSshStore((s) => s.status);
  const sessions = Object.values(statuses).filter((status) => status === "connected").length;
  const hosts = useConnectionStore((s) => s.connections.length);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-2">
      {ITEMS.filter((item) => item.id !== "pixel" || npcsVisible).map((item) => {
        const active = activeView === item.id;
        const label = t(item.labelKey);
        const badge = item.id === "terminal" && sessions > 0 ? sessions : 0;
        const isNew = item.id === "pixel" && !badgeSeen;

        return (
          <button
            key={item.id}
            type="button"
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (item.id === "pixel") markBadgeSeen();
              setActiveView(item.id);
            }}
            className={cx(
              "relative grid h-9 w-9 place-items-center rounded-md transition-colors",
              active ? "bg-elevated text-accent" : "text-muted hover:bg-elevated hover:text-text",
            )}
          >
            {active && (
              <span className="absolute -left-2 h-5 w-[2px] rounded-r-full bg-accent" />
            )}
            {item.icon}
            {badge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                {badge}
              </span>
            )}
            {isNew && (
              <span className="absolute -right-1 -top-1 rounded-full bg-gradient-to-r from-accent to-[#8b5cf6] px-1.5 py-[1px] text-[8px] font-bold text-white shadow-[0_0_10px_-2px_rgba(34,211,238,0.9)]">
                {t("activitybar.newBadge")}
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        title={t("activitybar.aiAssistant")}
        aria-label={t("activitybar.aiAssistant")}
        onClick={() => toggleRightPanel("ai")}
        className={cx(
          "grid h-9 w-9 place-items-center rounded-md transition-colors",
          rightPanel === "ai"
            ? "bg-elevated text-accent"
            : "text-muted hover:bg-elevated hover:text-text",
        )}
      >
        <Sparkles size={18} />
      </button>

      <div className="mt-auto flex flex-col items-center gap-1">
        <span
          className="mb-1 rounded bg-elevated px-1.5 py-0.5 text-[9px] text-muted"
          title={t("activitybar.savedHosts", { count: hosts })}
        >
          {hosts}
        </span>

        <button
          type="button"
          title={t("activitybar.settings")}
          aria-label={t("activitybar.settings")}
          onClick={() => setSettingsOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
        >
          <Settings size={18} />
        </button>

        <button
          type="button"
          title={t("activitybar.about")}
          aria-label={t("activitybar.about")}
          onClick={() => setAboutOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
        >
          <Info size={18} />
        </button>

        <span
          className="mt-1 grid h-7 w-7 place-items-center rounded-full bg-accent/20 text-accent"
          title={t("titlebar.localSession")}
        >
          <User size={14} />
        </span>
      </div>
    </nav>
  );
}

export default ActivityBar;
