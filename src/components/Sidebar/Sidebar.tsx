// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useMemo } from "react";
import {
  Search,
  Plus,
  Server,
  Trash2,
  ChevronRight,
  ChevronDown,
  Plug,
  FileDown,
  MoreHorizontal,
  Settings2,
} from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTabStore } from "../../stores/tabStore";
import { useUiStore } from "../../stores/uiStore";
import type { Connection } from "../../types";
import { cx, formatLatency, fuzzyMatch, hashHue, initials } from "../../lib/utils";
import { useT } from "../../i18n";

/** Avatar circular estable para un host: color derivado del nombre. */
function HostAvatar({ connection, size = 18 }: { connection: Connection; size?: number }) {
  const hue = hashHue(connection.name || connection.host);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: `hsl(${hue} 52% 24%)`,
        color: `hsl(${hue} 85% 74%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 60% 40% / 0.5)`,
      }}
    >
      {initials(connection.name)}
    </span>
  );
}

function HostRow({ connection }: { connection: Connection }) {
  const t = useT();
  const selectedId = useConnectionStore((s) => s.selectedId);
  const selectConnection = useConnectionStore((s) => s.selectConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setHostSettingsId = useUiStore((s) => s.setHostSettingsId);
  const touchConnection = useConnectionStore((s) => s.touchConnection);
  const probe = useConnectionStore((s) => s.probes[connection.id]);
  const openTab = useTabStore((s) => s.openTab);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const pushToast = useUiStore((s) => s.pushToast);

  const selected = selectedId === connection.id;
  const online = probe?.reachable === true;
  const checked = probe !== undefined;

  const openSession = () => {
    openTab({
      kind: connection.protocol === "sftp" ? "sftp" : "terminal",
      connectionId: connection.id,
      title: connection.name,
    });
    touchConnection(connection.id);
    setActiveView(connection.protocol === "sftp" ? "files" : "terminal");
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectConnection(connection.id)}
      onDoubleClick={openSession}
      onKeyDown={(event) => {
        if (event.key === "Enter") openSession();
      }}
      title={`${connection.username ? `${connection.username}@` : ""}${connection.host}:${connection.port}${
        probe ? ` · ${formatLatency(probe.latencyMs)}` : ""
      }`}
      className={cx(
        "group flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
        selected ? "bg-accent/15" : "hover:bg-elevated",
      )}
    >
      <HostAvatar connection={connection} />

      <span className="min-w-0 flex-1 truncate text-[11px] text-text">{connection.name}</span>

      {online ? (
        <span className="shrink-0 rounded bg-success/15 px-1.5 py-[1px] text-[9px] font-medium text-success">
          {t("sidebar.online")}
        </span>
      ) : (
        checked && <span className="shrink-0 text-[9px] text-muted">{t("sidebar.offline")}</span>
      )}

      <span
        className={cx(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          !checked ? "bg-warning/60" : online ? "bg-success" : "bg-border",
        )}
      />

      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title={t("sidebar.openSession")}
          aria-label={t("sidebar.openSessionNamed", { name: connection.name })}
          onClick={(event) => {
            event.stopPropagation();
            openSession();
          }}
          className="grid h-4 w-4 place-items-center rounded text-muted hover:text-success"
        >
          <Plug size={11} />
        </button>
        <button
          type="button"
          title={t("sidebar.hostProperties")}
          aria-label={t("sidebar.hostPropertiesNamed", { name: connection.name })}
          onClick={(event) => {
            event.stopPropagation();
            setHostSettingsId(connection.id);
          }}
          className="grid h-4 w-4 place-items-center rounded text-muted hover:text-accent"
        >
          <Settings2 size={11} />
        </button>
        <button
          type="button"
          title={t("sidebar.deleteHost")}
          aria-label={t("sidebar.deleteHostNamed", { name: connection.name })}
          onClick={(event) => {
            event.stopPropagation();
            void removeConnection(connection.id);
            pushToast("warning", t("sidebar.hostDeleted"), connection.name);
          }}
          className="grid h-4 w-4 place-items-center rounded text-muted hover:text-danger"
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}

export function Sidebar() {
  const t = useT();
  const connections = useConnectionStore((s) => s.connections);
  const search = useConnectionStore((s) => s.search);
  const setSearch = useConnectionStore((s) => s.setSearch);
  const loading = useConnectionStore((s) => s.loading);
  const probing = useConnectionStore((s) => s.probing);
  const refreshStatuses = useConnectionStore((s) => s.refreshStatuses);
  const collapsed = useUiStore((s) => s.collapsedGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const setNewHostOpen = useUiStore((s) => s.setNewHostOpen);

  const groups = useMemo(() => {
    const filtered = connections.filter((connection) =>
      fuzzyMatch(search, `${connection.name} ${connection.host} ${connection.username} ${connection.group}`),
    );
    const buckets = new Map<string, Connection[]>();
    for (const connection of filtered) {
      const list = buckets.get(connection.group) ?? [];
      list.push(connection);
      buckets.set(connection.group, list);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [connections, search]);

  // El grupo del host seleccionado se resalta suavemente.
  const total = connections.length;

  return (
    <aside
      data-tour="sidebar"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      {/* Cabecera */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded bg-accent text-[10px] font-bold text-accentfg">
          CT
        </span>
        <span className="text-[13px] font-semibold tracking-tight">CloudTerm</span>
        <button
          type="button"
          title={t("sidebar.importSsh")}
          aria-label={t("sidebar.importSsh")}
          onClick={() => setImportOpen(true)}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-elevated hover:text-accent"
        >
          <FileDown size={13} />
        </button>
        <button
          type="button"
          title={t("sidebar.newHost")}
          aria-label={t("sidebar.newHost")}
          onClick={() => setNewHostOpen(true)}
          className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-elevated hover:text-accent"
        >
          <Plus size={14} />
        </button>
      </div>

      <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {t("sidebar.remoteHosts")}
      </h2>

      {/* Búsqueda */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg/60 px-2 py-1 focus-within:border-accent/60">
          <Search size={12} className="shrink-0 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            className="w-full bg-transparent text-[11px] text-text placeholder:text-muted focus:outline-none"
          />
          {probing && (
            <span className="shrink-0 text-[9px] text-accent" title={t("sidebar.checkingHosts")}>
              …
            </span>
          )}
        </div>
      </div>

      {/* Árbol */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {groups.length === 0 && (
          <div className="px-2 py-8 text-center">
            <p className="text-[11px] leading-relaxed text-muted">
              {total === 0
                ? t("sidebar.empty")
                : t("sidebar.noMatches", { search })}
            </p>
          </div>
        )}

        {groups.map(([group, items]) => {
          const isCollapsed = collapsed.includes(group);
          return (
            <section key={group}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center gap-1 rounded px-1 py-1 text-left transition-colors hover:bg-elevated/60"
              >
                {isCollapsed ? (
                  <ChevronRight size={11} className="shrink-0 text-muted" />
                ) : (
                  <ChevronDown size={11} className="shrink-0 text-muted" />
                )}
                <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {group}
                </span>
                <span className="ml-auto shrink-0 text-[9px] text-muted/70">{items.length}</span>
              </button>

              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {items.map((connection) => (
                    <HostRow key={connection.id} connection={connection} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Sondeo + nuevo host */}
      <div className="space-y-1.5 border-t border-border p-2">
        <button
          type="button"
          onClick={() => void refreshStatuses()}
          disabled={probing || total === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-40"
        >
          <Server size={11} />
          {loading
            ? t("common.loading")
            : probing
              ? t("sidebar.checking")
              : t("sidebar.checkStatus", { count: total })}
        </button>

        <button
          type="button"
          onClick={() => setNewHostOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-accent/50 px-2 py-2 text-[11px] font-medium text-accent transition-colors hover:border-accent hover:bg-accent/10"
        >
          <Plus size={12} />
          {t("sidebar.newHost")}
        </button>

        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded px-2 py-1 text-[10px] text-muted transition-colors hover:text-text"
        >
          <MoreHorizontal size={11} />
          {t("sidebar.importSsh")}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
