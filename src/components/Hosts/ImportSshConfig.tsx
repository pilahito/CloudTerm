import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileCode2, AlertTriangle, Check, Download, RefreshCw } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { sshConfigPreview, type SshConfigPreview } from "../../lib/hosts";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

export function ImportSshConfig() {
  const t = useT();
  const open = useUiStore((s) => s.importOpen);
  const setOpen = useUiStore((s) => s.setImportOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const importHosts = useConnectionStore((s) => s.importHosts);

  const [preview, setPreview] = useState<SshConfigPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setLoading(true);
    sshConfigPreview()
      .then((data) => {
        setPreview(data);
        // Todo marcado por defecto: lo normal es querer importarlo todo.
        setSelected(new Set(data.entries.map((_, index) => index)));
      })
      .catch((err: unknown) => {
        pushToast("error", t("hosts.readFailedTitle"), String(err));
        setPreview(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) refresh();
    // `refresh` es estable por construcción; solo interesa el cambio de `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (index: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    const all = selected.size === preview.entries.length;
    setSelected(all ? new Set() : new Set(preview.entries.map((_, index) => index)));
  };

  const submit = async () => {
    if (!preview) return;
    const chosen = preview.entries.filter((_, index) => selected.has(index));
    if (chosen.length === 0) {
      pushToast("warning", t("hosts.nothingSelectedTitle"), t("hosts.nothingSelectedDetail"));
      return;
    }

    setBusy(true);
    const imported = await importHosts(chosen);
    setBusy(false);
    setOpen(false);

    if (imported === 0) {
      pushToast("info", t("hosts.nothingNewTitle"), t("hosts.nothingNewDetail"));
    } else {
      pushToast(
        "success",
        imported === 1
          ? t("hosts.importedOne", { count: imported })
          : t("hosts.importedMany", { count: imported }),
        chosen.length > imported
          ? t("hosts.someSkippedDetail", { count: chosen.length - imported })
          : t("hosts.importedFromSshConfig"),
      );
    }
  };

  const total = preview?.entries.length ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <FileCode2 size={15} className="text-accent" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-tight">{t("hosts.importTitle")}</h2>
                <p className="truncate font-mono text-[10px] text-muted">
                  {preview?.path ?? t("hosts.reading")}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("hosts.reload")}
                title={t("hosts.reloadHint")}
                onClick={refresh}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <RefreshCw size={13} className={cx(loading && "animate-spin")} />
              </button>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setOpen(false)}
                className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {preview && !preview.exists && (
                <p className="rounded-md border border-border bg-bg/50 px-3 py-6 text-center text-[11px] text-muted">
                  {t("hosts.noFileBefore")} <span className="font-mono text-text">{preview.path}</span>
                  {t("hosts.noFileAfter")}
                  <br />
                  {t("hosts.noFileHint")}
                </p>
              )}

              {preview && preview.exists && total === 0 && (
                <p className="rounded-md border border-border bg-bg/50 px-3 py-6 text-center text-[11px] text-muted">
                  {t("hosts.noConcreteHostBefore")}{" "}
                  <span className="font-mono text-text">Host *</span>{" "}
                  {t("hosts.noConcreteHostAfter")}
                </p>
              )}

              {preview && total > 0 && (
                <>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="mb-2 flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                  >
                    <span className="grid h-3.5 w-3.5 place-items-center rounded border border-border">
                      {selected.size === total && <Check size={10} className="text-accent" />}
                    </span>
                    {selected.size === total ? t("hosts.deselectAll") : t("hosts.selectAll")}
                    <span className="ml-auto text-[10px]">
                      {selected.size}/{total}
                    </span>
                  </button>

                  <ul className="space-y-1">
                    {preview.entries.map((entry, index) => {
                      const active = selected.has(index);
                      return (
                        <li key={`${entry.name}-${index}`}>
                          <button
                            type="button"
                            onClick={() => toggle(index)}
                            className={cx(
                              "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                              active
                                ? "border-accent/50 bg-accent/10"
                                : "border-border hover:bg-elevated",
                            )}
                          >
                            <span
                              className={cx(
                                "grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
                                active ? "border-accent bg-accent" : "border-border",
                              )}
                            >
                              {active && <Check size={10} className="text-accentfg" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] text-text">
                                {entry.name}
                              </span>
                              <span className="block truncate font-mono text-[10px] text-muted">
                                {entry.username ? `${entry.username}@` : ""}
                                {entry.host}:{entry.port}
                                {entry.privateKeyPath ? ` · ${entry.privateKeyPath}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {preview && preview.warnings.length > 0 && (
                <div className="mt-3 space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium text-warning">
                    <AlertTriangle size={11} /> {t("hosts.fileWarnings")}
                  </p>
                  {preview.warnings.map((warning) => (
                    <p key={warning} className="text-[10px] leading-relaxed text-warning/90">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
              <span className="text-[10px] text-muted">
                {t("hosts.duplicatesSkipped")}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={submit}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={12} />
                {busy ? t("hosts.importing") : t("hosts.importCount", { count: selected.size })}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ImportSshConfig;
