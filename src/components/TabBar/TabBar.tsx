// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { Plus, X, Terminal as TerminalIcon, FolderTree, FolderOpen, Sparkles, Users } from "lucide-react";
import { useTabStore } from "../../stores/tabStore";
import { useUiStore } from "../../stores/uiStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEasterEggStore } from "../../stores/easterEggStore";
import { cx, hashHue, initials } from "../../lib/utils";
import { useT } from "../../i18n";

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-muted",
  connecting: "bg-warning animate-pulse",
  connected: "bg-success",
  error: "bg-danger",
  closed: "bg-border",
};

/** Avatar del host asociado a la pestaña; si es local, un icono genérico. */
function TabIcon({ connectionId, kind }: { connectionId: string | null; kind: string }) {
  const connection = useConnectionStore((s) =>
    connectionId ? s.connections.find((c) => c.id === connectionId) : undefined,
  );

  if (!connection) {
    return kind === "sftp" ? (
      <FolderTree size={12} className="shrink-0 text-muted" />
    ) : (
      <TerminalIcon size={12} className="shrink-0 text-muted" />
    );
  }

  const hue = hashHue(connection.name || connection.host);
  return (
    <span
      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[7px] font-bold"
      style={{
        backgroundColor: `hsl(${hue} 52% 26%)`,
        color: `hsl(${hue} 85% 76%)`,
      }}
    >
      {initials(connection.name)}
    </span>
  );
}

export function TabBar() {
  const t = useT();
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const openTab = useTabStore((s) => s.openTab);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const npcsUnlocked = useEasterEggStore((s) => s.npcsUnlocked);
  const showNpcs = useEasterEggStore((s) => s.showNpcs);

  const iconButton =
    "grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text";

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-surface pl-2 pr-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            tabIndex={0}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setActiveTab(tab.id);
            }}
            className={cx(
              "group flex h-6 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors",
              tab.id === activeTabId
                ? "border-border bg-elevated text-text"
                : "border-transparent text-muted hover:bg-elevated/50 hover:text-text",
            )}
          >
            <TabIcon connectionId={tab.connectionId} kind={tab.kind} />
            <span className="truncate">{tab.title}</span>
            <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_COLOR[tab.status])} />
            <button
              type="button"
              title={t("tabbar.close")}
              aria-label={t("tabbar.closeNamed", { title: tab.title })}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
              className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:bg-border hover:text-text group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        <button
          type="button"
          title={t("tabbar.newTab")}
          aria-label={t("tabbar.new")}
          onClick={() => openTab({ kind: "terminal" })}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-text"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          title={t("tabbar.sftpPanel")}
          aria-label={t("tabbar.sftpPanel")}
          onClick={() => toggleRightPanel("sftp")}
          className={cx(iconButton, rightPanel === "sftp" && "bg-elevated text-accent")}
        >
          <FolderOpen size={13} />
        </button>
        <button
          type="button"
          title={t("tabbar.aiAssistant")}
          aria-label={t("tabbar.aiAssistant")}
          onClick={() => toggleRightPanel("ai")}
          className={cx(iconButton, rightPanel === "ai" && "bg-elevated text-accent")}
        >
          <Sparkles size={13} />
        </button>
        {npcsUnlocked && showNpcs && (
          <button
            type="button"
            title={t("view.pixel")}
            aria-label={t("view.pixel")}
            onClick={() => toggleRightPanel("pixel")}
            className={cx(iconButton, rightPanel === "pixel" && "bg-elevated text-accent")}
          >
            <Users size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default TabBar;
