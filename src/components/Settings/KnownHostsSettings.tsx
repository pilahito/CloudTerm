import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Trash2, RefreshCw, FileText, AlertTriangle } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { openExternal } from "../../lib/links";
import {
  knownHostsClear,
  knownHostsList,
  knownHostsPath,
  knownHostsRemove,
  type KnownHostEntry,
} from "../../lib/knownHosts";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

/**
 * Ajustes → Claves de servidor.
 *
 * Muestra el `known_hosts` propio y permite borrar entradas: es lo que hay que
 * hacer cuando un servidor legítimo cambia de clave (por ejemplo, tras
 * reinstalarlo).
 */
export function KnownHostsSettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);
  const [entries, setEntries] = useState<KnownHostEntry[]>([]);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, file] = await Promise.all([knownHostsList(), knownHostsPath()]);
      setEntries(list);
      setPath(file);
    } catch (err) {
      pushToast("error", t("knownHosts.readError"), String(err));
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (entry: KnownHostEntry) => {
    if (
      !window.confirm(
        t("knownHosts.forgetConfirm", { host: entry.host, port: entry.port }),
      )
    ) {
      return;
    }
    try {
      await knownHostsRemove(entry.host, entry.port);
      pushToast("success", t("knownHosts.forgotten"), `${entry.host}:${entry.port}`);
      await refresh();
    } catch (err) {
      pushToast("error", t("knownHosts.deleteError"), String(err));
    }
  };

  const clearAll = async () => {
    if (!window.confirm(t("knownHosts.clearConfirm"))) return;
    try {
      await knownHostsClear();
      pushToast("warning", t("knownHosts.clearedTitle"), t("knownHosts.clearedDetail"));
      await refresh();
    } catch (err) {
      pushToast("error", t("knownHosts.clearError"), String(err));
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 pt-3">
        <ShieldCheck size={12} className="text-accent" />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {t("knownHosts.title")}
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          title={t("common.refresh")}
          aria-label={t("common.refresh")}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
        >
          <RefreshCw size={11} className={cx(loading && "animate-spin")} />
        </button>
      </div>

      <p className="py-2 text-[10px] leading-relaxed text-muted">
        {t("knownHosts.description")}
      </p>

      <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-bg/50 px-2.5 py-1.5">
        <FileText size={11} className="shrink-0 text-muted" />
        <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted" title={path}>
          {path || "—"}
        </code>
        <button
          type="button"
          onClick={() =>
            void openExternal(`file://${path}`).catch(() =>
              pushToast("warning", t("knownHosts.openManually"), path),
            )
          }
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:text-text"
        >
          {t("common.open")}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-md border border-border bg-bg/40 px-3 py-5 text-center text-[11px] text-muted">
          {loading ? t("common.loading") : t("knownHosts.empty")}
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={`${entry.host}:${entry.port}`}
              className="group flex items-center gap-2 rounded-md border border-border bg-bg/40 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-text">
                  {entry.host}
                  <span className="text-muted">:{entry.port}</span>
                </div>
                <div className="truncate font-mono text-[10px] text-muted" title={entry.fingerprint}>
                  {entry.fingerprint || entry.keyType}
                </div>
              </div>
              <button
                type="button"
                title={t("knownHosts.forgetTooltip")}
                aria-label={t("knownHosts.forgetAria", { host: entry.host })}
                onClick={() => void remove(entry)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <button
          type="button"
          onClick={() => void clearAll()}
          className="mt-2 flex items-center gap-1.5 rounded-md border border-danger/40 px-2.5 py-1.5 text-[10px] text-danger transition-colors hover:bg-danger/10"
        >
          <AlertTriangle size={11} />
          {t("knownHosts.clearAll")}
        </button>
      )}
    </section>
  );
}

export default KnownHostsSettings;
