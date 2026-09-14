import { motion, AnimatePresence } from "motion/react";
import { Info, CheckCircle2, AlertTriangle, XCircle, Gift, X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import type { ToastKind } from "../../types";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

const STYLES: Record<ToastKind, { icon: React.ReactNode; ring: string; glow?: boolean }> = {
  info: { icon: <Info size={14} />, ring: "border-accent/50 text-accent" },
  success: { icon: <CheckCircle2 size={14} />, ring: "border-success/50 text-success" },
  warning: { icon: <AlertTriangle size={14} />, ring: "border-warning/50 text-warning" },
  error: { icon: <XCircle size={14} />, ring: "border-danger/50 text-danger" },
  // El aviso de desbloqueo es distinto a todo lo demás: lleva degradado y botón.
  unlock: { icon: <Gift size={14} />, ring: "border-accent/60 text-accent", glow: true },
};

export function ToastContainer() {
  const t = useT();
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const setActiveView = useUiStore((s) => s.setActiveView);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = STYLES[toast.kind];
          const isUnlock = toast.kind === "unlock";

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className={cx(
                "pointer-events-auto rounded-lg border bg-elevated px-3 py-2.5 shadow-xl",
                style.ring,
                style.glow &&
                  "bg-gradient-to-br from-accent/15 via-elevated to-[#8b5cf6]/15 shadow-[0_0_28px_-8px_rgba(34,211,238,0.7)]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{style.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-text">{toast.title}</div>
                  {toast.description && (
                    <div className="mt-0.5 break-words text-[11px] text-muted">
                      {toast.description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("toast.dismiss")}
                  onClick={() => dismissToast(toast.id)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted hover:bg-border hover:text-text"
                >
                  <X size={11} />
                </button>
              </div>

              {isUnlock && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView("pixel");
                      dismissToast(toast.id);
                    }}
                    className="rounded-md bg-accent px-2.5 py-1 text-[10px] font-medium text-accentfg transition-opacity hover:opacity-90"
                  >
                    {t("toast.viewNow")}
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default ToastContainer;
