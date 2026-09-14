import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ExternalLink, FileText, Loader2 } from "lucide-react";
import { listEditors, preferredEditor, rememberEditor, type Editor } from "../../lib/editor";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

/** Lo que se va a abrir. */
export interface OpenTarget {
  kind: "local" | "remote";
  /** Ruta local o remota, según `kind`. */
  path: string;
  name: string;
}

interface Props {
  target: OpenTarget | null;
  onClose: () => void;
  onPick: (program: string) => void;
}

/**
 * Diálogo para elegir con qué editor abrir un archivo.
 *
 * Solo ofrece editores **instalados**: se detectan en el `PATH`, así que no se
 * puede elegir uno que no exista.
 */
export function EditorPicker({ target, onClose, onPick }: Props) {
  const t = useT();
  const [editors, setEditors] = useState<Editor[] | null>(null);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setEditors(null);
    void listEditors()
      .then((list) => {
        if (alive) setEditors(list);
      })
      .catch(() => {
        if (alive) setEditors([]);
      });
    return () => {
      alive = false;
    };
  }, [target]);

  // Si el usuario ya eligió uno y marcó recordarlo, no se le vuelve a preguntar.
  useEffect(() => {
    if (!target) return;
    const guardado = preferredEditor();
    if (guardado) onPick(guardado);
    // Deliberadamente solo cuando cambia el objetivo: `onPick` cambia de
    // identidad en cada render y volvería a dispararse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const elegir = (program: string) => {
    if (remember) rememberEditor(program);
    onPick(program);
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <ExternalLink size={15} className="text-accent" />
              <h2 className="text-sm font-semibold">{t("common.openWith")}</h2>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={onClose}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <FileText size={12} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-text" title={target.path}>
                {target.name}
              </span>
              <span className="shrink-0 rounded bg-elevated px-1.5 py-[1px] text-[9px] text-muted">
                {target.kind === "remote" ? t("common.remote") : t("common.local")}
              </span>
            </div>

            <ul className="max-h-64 overflow-y-auto p-1">
              {editors === null && (
                <li className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted">
                  <Loader2 size={12} className="animate-spin" /> {t("sftp.searchingEditors")}
                </li>
              )}

              {editors?.length === 0 && (
                <li className="px-2 py-4 text-[11px] leading-relaxed text-muted">
                  {t("sftp.noEditors")}
                </li>
              )}

              {editors?.map((editor) => (
                <li key={editor.id}>
                  <button
                    type="button"
                    onClick={() => elegir(editor.program)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-text transition-colors hover:bg-elevated"
                  >
                    <span className="min-w-0 flex-1 truncate">{editor.label}</span>
                    <span className="shrink-0 font-mono text-[9px] text-muted">
                      {editor.program}
                    </span>
                  </button>
                </li>
              ))}

              {editors !== null && (
                <li className="mt-1 border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={() => elegir("")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-muted transition-colors hover:bg-elevated hover:text-text"
                  >
                    {t("sftp.systemDefaultApp")}
                  </button>
                </li>
              )}
            </ul>

            <footer className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className={cx("accent-[rgb(var(--ct-accent))]")}
                />
                {t("sftp.dontAskAgain")}
              </label>
              <span className="ml-auto truncate text-[9px] text-muted">
                {target.kind === "remote" ? t("sftp.changesUploadedOnSave") : ""}
              </span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default EditorPicker;
