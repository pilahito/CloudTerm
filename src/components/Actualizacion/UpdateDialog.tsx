// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  RefreshCw,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { comprobarActualizacion, type InfoActualizacion } from "../../lib/actualizacion";
import { openExternal } from "../../lib/links";
import { useT } from "../../i18n";
import { cx } from "../../lib/utils";

const BOTON =
  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] transition-colors";

/**
 * Diálogo de actualizaciones.
 *
 * Solo informa: no descarga ni instala nada por su cuenta. Actualizar es una
 * decisión del usuario, y aquí se le dan el enlace y el botón para hacerlo.
 */
export function UpdateDialog() {
  const t = useT();
  const open = useUiStore((s) => s.updateOpen);
  const setOpen = useUiStore((s) => s.setUpdateOpen);

  const [info, setInfo] = useState<InfoActualizacion | null>(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = async () => {
    setBuscando(true);
    try {
      setInfo(await comprobarActualizacion());
    } catch (err) {
      setInfo({
        actual: "?",
        ultima: null,
        hayNueva: false,
        url: null,
        descarga: null,
        notas: null,
        publicada: null,
        aviso: String(err),
      });
    } finally {
      setBuscando(false);
    }
  };

  // Se busca al abrir, sin que haya que pulsar nada.
  useEffect(() => {
    if (open) void buscar();
    // Deliberadamente solo cuando se abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const abrir = (url: string | null) => {
    if (url) void openExternal(url);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-6 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <RefreshCw size={15} className="text-accent" />
              <h2 className="text-sm font-semibold">{t("update.title")}</h2>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setOpen(false)}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {buscando && (
                <p className="flex items-center gap-2 text-[11px] text-muted">
                  <Loader2 size={12} className="animate-spin" /> {t("update.checking")}
                </p>
              )}

              {!buscando && info?.aviso && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <AlertTriangle size={13} className="mt-[1px] shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-text">{t("update.failed")}</p>
                    <p className="mt-0.5 break-words text-[10px] text-muted">{info.aviso}</p>
                  </div>
                </div>
              )}

              {!buscando && info && !info.aviso && !info.hayNueva && (
                <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
                  <CheckCircle2 size={13} className="shrink-0 text-success" />
                  <p className="text-[11px] text-text">
                    {t("update.upToDate", { version: info.actual })}
                  </p>
                </div>
              )}

              {!buscando && info?.hayNueva && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
                    <p className="text-[11px] font-medium text-text">{t("update.available")}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {t("update.availableDetail", {
                        current: info.actual,
                        latest: info.ultima ?? "?",
                      })}
                    </p>
                  </div>

                  {info.notas && (
                    <>
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {t("update.notes")}
                      </h3>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg/40 p-2 font-sans text-[10px] leading-relaxed text-muted">
                        {info.notas}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={buscando}
                onClick={() => void buscar()}
                className={cx(BOTON, "text-muted hover:text-text", buscando && "opacity-40")}
              >
                <RefreshCw size={11} className={cx(buscando && "animate-spin")} />
                {t("update.check")}
              </button>

              {info?.hayNueva && (
                <div className="ml-auto flex items-center gap-1.5">
                  {info.url && (
                    <button
                      type="button"
                      onClick={() => abrir(info.url)}
                      className={cx(BOTON, "text-muted hover:text-text")}
                    >
                      <ExternalLink size={11} /> {t("update.openRelease")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => abrir(info.descarga ?? info.url)}
                    className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
                  >
                    <Download size={11} /> {t("update.download")}
                  </button>
                </div>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default UpdateDialog;
