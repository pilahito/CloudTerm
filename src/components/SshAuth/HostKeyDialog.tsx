// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck, X } from "lucide-react";
import { useHostKeyStore } from "../../stores/hostKeyStore";
import { onHostKeyPrompt } from "../../lib/knownHosts";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

/**
 * Aviso de clave de servidor.
 *
 * Aparece cuando el servidor presenta una clave que no está guardada (primera
 * conexión) o cuando ha cambiado respecto a la que había. En el segundo caso el
 * tono es deliberadamente alarmante: un cambio de clave sin explicación es la
 * firma de un ataque de intermediario.
 */
export function HostKeyDialog() {
  const t = useT();
  const prompts = useHostKeyStore((s) => s.prompts);
  const push = useHostKeyStore((s) => s.push);
  const resolve = useHostKeyStore((s) => s.resolve);

  // Los avisos llegan por eventos del backend.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let disposed = false;
    void onHostKeyPrompt(push).then((unlisten) => {
      if (disposed) unlisten?.();
      else stop = unlisten;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [push]);

  const prompt = prompts[0];
  const isMismatch = Boolean(prompt?.oldFingerprint);

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-6 backdrop-blur-[2px]"
          onClick={() => {
            // Cerrar sin decidir equivale a rechazar.
            void resolve(prompt.requestId, false, false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(event) => event.stopPropagation()}
            className={cx(
              "w-full max-w-lg overflow-hidden rounded-xl border bg-surface shadow-2xl",
              isMismatch ? "border-danger" : "border-border",
            )}
          >
            {isMismatch ? (
              /* ------------------------------ Cambio de clave ------------------------------ */
              <>
                <header className="flex items-center gap-3 border-b border-danger/40 bg-danger/15 px-4 py-4">
                  <span className="text-3xl leading-none" aria-hidden="true">
                    ⚠️
                  </span>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-danger">
                      {t("hostKey.mismatchTitle")}
                    </h2>
                    <p className="text-[11px] text-danger/80">
                      {t("hostKey.mismatchSubtitle")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("common.cancel")}
                    onClick={() => void resolve(prompt.requestId, false, false)}
                    className="ml-auto grid h-6 w-6 place-items-center rounded text-danger/70 hover:bg-danger/20 hover:text-danger"
                  >
                    <X size={14} />
                  </button>
                </header>

                <div className="space-y-3 px-4 py-4">
                  <FingerprintRow
                    label={t("hostKey.before")}
                    value={prompt.oldFingerprint ?? ""}
                    tone="muted"
                  />
                  <FingerprintRow
                    label={t("hostKey.after")}
                    value={prompt.fingerprint}
                    tone="danger"
                  />

                  <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-[11px] leading-relaxed text-danger">
                    {t("hostKey.mismatchWarning1")}
                    <strong>{t("hostKey.mismatchWarningBold")}</strong>
                    {t("hostKey.mismatchWarning2")}
                    <strong>{t("hostKey.mismatchWarningDanger")}</strong>
                  </p>
                </div>

                <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void resolve(prompt.requestId, false, false)}
                    className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolve(prompt.requestId, true, true)}
                    className="ml-auto rounded-md border border-danger px-3 py-1.5 text-[11px] text-danger transition-colors hover:bg-danger hover:text-white"
                  >
                    {t("hostKey.acceptAnyway")}
                  </button>
                </footer>
              </>
            ) : (
              /* ---------------------------- Host desconocido ---------------------------- */
              <>
                <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <ShieldCheck size={16} className="text-accent" />
                  <div>
                    <h2 className="text-sm font-semibold">{t("hostKey.unknownTitle")}</h2>
                    <p className="text-[10px] text-muted">
                      {t("hostKey.unknownSubtitle")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("common.cancel")}
                    onClick={() => void resolve(prompt.requestId, false, false)}
                    className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
                  >
                    <X size={14} />
                  </button>
                </header>

                <div className="space-y-3 px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-accent/15 px-2 py-1 font-mono text-[11px] text-accent">
                      {prompt.host}:{prompt.port}
                    </span>
                    <span className="rounded bg-elevated px-2 py-1 font-mono text-[10px] text-muted">
                      {prompt.keyType}
                    </span>
                  </div>

                  <FingerprintRow
                    label={t("hostKey.fingerprint")}
                    value={prompt.fingerprint}
                    tone="accent"
                  />

                  <p className="rounded-md border border-border bg-bg/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                    {t("hostKey.fingerprintHint")}
                  </p>
                </div>

                <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void resolve(prompt.requestId, false, false)}
                    className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolve(prompt.requestId, true, false)}
                    className="ml-auto rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                  >
                    {t("hostKey.onceOnly")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolve(prompt.requestId, true, true)}
                    className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
                  >
                    {t("hostKey.acceptAndSave")}
                  </button>
                </footer>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Huella en monoespaciada, seleccionable y con la etiqueta a la izquierda. */
function FingerprintRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "accent" | "danger" | "muted";
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 w-12 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <code
        className={cx(
          "min-w-0 flex-1 select-text break-all rounded-md border px-2.5 py-2 font-mono text-[11px]",
          tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
          tone === "accent" && "border-accent/40 bg-accent/10 text-accent",
          tone === "muted" && "border-border bg-bg/50 text-muted line-through",
        )}
      >
        {value || "—"}
      </code>
    </div>
  );
}

export default HostKeyDialog;
