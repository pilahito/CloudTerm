import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Gift,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
  Play,
  AlertTriangle,
  Rocket,
  Lock,
  X,
} from "lucide-react";
import { useEasterEggStore } from "../../stores/easterEggStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { cx } from "../../lib/utils";
import { useLanguage, useT } from "../../i18n";

/** Confirmación que exige escribir una palabra para las acciones destructivas. */
function ConfirmDialog({
  title,
  detail,
  word,
  onCancel,
  onConfirm,
}: {
  title: string;
  detail: string;
  word: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState("");
  // `common.confirmWord` trae el marcador `{word}`: se parte para poder dar
  // estilo a la palabra sin traducirla.
  const [beforeWord, afterWord = ""] = t("common.confirmWord").split("{word}");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-6"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-danger/50 bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-danger/40 bg-danger/10 px-4 py-3">
          <AlertTriangle size={14} className="text-danger" />
          <h3 className="text-xs font-semibold text-danger">{title}</h3>
          <button
            type="button"
            aria-label={t("common.cancel")}
            onClick={onCancel}
            className="ml-auto grid h-5 w-5 place-items-center rounded text-danger/70 hover:bg-danger/20"
          >
            <X size={12} />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <p className="text-[11px] leading-relaxed text-muted">{detail}</p>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {beforeWord}
              <span className="font-mono text-danger">{word}</span>
              {afterWord}
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 font-mono text-xs text-text focus:border-danger focus:outline-none"
            />
          </label>
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={typed.trim() !== word}
            onClick={onConfirm}
            className="ml-auto rounded-md bg-danger px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("easterEgg.confirm")}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-text">{label}</div>
        {hint && <div className="text-[10px] leading-relaxed text-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cx("relative h-5 w-9 rounded-full transition-colors", value ? "bg-accent" : "bg-border")}
    >
      <span
        className={cx(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          value ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

const ACTION =
  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] text-muted transition-colors hover:text-text";

export function EasterEggSettings() {
  const t = useT();
  const language = useLanguage();
  const store = useEasterEggStore();
  const sounds = useSettingsStore((s) => s.settings.sounds);
  const updateSettings = useSettingsStore((s) => s.update);
  const pushToast = useUiStore((s) => s.pushToast);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const connections = useConnectionStore((s) => s.connections);
  const removeConnection = useConnectionStore((s) => s.removeConnection);

  const [confirm, setConfirm] = useState<null | "unlock" | "all" | "cloudterm">(null);
  const isDev = import.meta.env.DEV;

  const hidden = store.hiddenUntil !== null && Date.now() < store.hiddenUntil;

  const removeUnlock = () => {
    store.resetUnlock();
    if (useUiStore.getState().activeView === "pixel") setActiveView("welcome");
    pushToast(
      "info",
      t("easterEgg.removed"),
      t("easterEgg.removedDetail"),
    );
    setConfirm(null);
  };

  const resetEverything = () => {
    store.resetAll();
    localStorage.removeItem("cloudterm-easter-eggs");
    pushToast("warning", t("easterEgg.resetTitle"), t("easterEgg.resetDetail"));
    setConfirm(null);
  };

  const resetCloudTerm = async () => {
    localStorage.clear();
    for (const connection of connections) {
      await removeConnection(connection.id);
    }
    store.resetAll();
    pushToast("warning", t("easterEgg.cloudTermReset"), t("easterEgg.cloudTermResetDetail"));
    setConfirm(null);
  };

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Gift size={11} /> {t("easterEgg.title")}
      </h3>

      {/* Estado */}
      <div className="mt-2 rounded-lg border border-border bg-bg/40 px-3 py-2.5 text-[11px]">
        {store.npcsUnlocked ? (
          <>
            <div className="flex items-center gap-2 text-success">
              <Eye size={12} />
              {t("easterEgg.unlocked")}
            </div>
            <div className="mt-1 text-[10px] text-muted">
              📅 {store.unlockedAt ? new Date(store.unlockedAt).toLocaleString(language) : "—"}
              {" · "}
              🔢 {store.unlocksCount}{" "}
              {store.unlocksCount === 1
                ? t("easterEgg.unlockCountOne")
                : t("easterEgg.unlockCountOther")}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted">
            <Lock size={12} />
            {t("easterEgg.noneDiscovered")}
          </div>
        )}
      </div>

      {store.npcsUnlocked && (
        <>
          {/* Visibilidad */}
          <Row
            label={t("easterEgg.showInSidebar")}
            hint={t("easterEgg.showInSidebarHint")}
          >
            <Toggle value={store.showNpcs} onChange={store.setShowNpcs} />
          </Row>
          <Row label={t("easterEgg.discreetMode")} hint={t("easterEgg.discreetModeHint")}>
            <Toggle value={store.discreetMode} onChange={store.setDiscreet} />
          </Row>
          <Row label={t("easterEgg.unlockSounds")} hint={t("easterEgg.unlockSoundsHint")}>
            <Toggle value={sounds} onChange={(value) => updateSettings({ sounds: value })} />
          </Row>

          {/* Acciones */}
          <div className="mt-1 flex flex-wrap gap-1.5 border-t border-border pt-3">
            <button
              type="button"
              className={ACTION}
              onClick={() => {
                store.resetCounters();
                pushToast("info", t("easterEgg.countersReset"), t("easterEgg.countersResetDetail"));
              }}
            >
              <RotateCcw size={11} /> {t("easterEgg.resetCounter")}
            </button>
            <button
              type="button"
              className={ACTION}
              onClick={() => {
                if (hidden) {
                  store.clearHide();
                  pushToast(
                    "success",
                    t("easterEgg.visibleAgain"),
                    t("easterEgg.visibleAgainDetail"),
                  );
                } else {
                  store.hideFor(30);
                  pushToast(
                    "info",
                    t("easterEgg.hiddenThirtyDays", { days: 30 }),
                    t("easterEgg.hiddenThirtyDaysDetail"),
                  );
                }
              }}
            >
              {hidden ? <Eye size={11} /> : <EyeOff size={11} />}
              {hidden
                ? t("easterEgg.showAgain")
                : t("easterEgg.hideThirtyDays", { days: 30 })}
            </button>
            <button
              type="button"
              className={ACTION}
              onClick={() => {
                store.triggerIntro();
                setActiveView("pixel");
                pushToast(
                  "success",
                  t("easterEgg.playingAnimation"),
                  t("easterEgg.playingAnimationDetail"),
                );
              }}
            >
              <Play size={11} /> {t("easterEgg.playAnimation")}
            </button>
          </div>
        </>
      )}

      {/* Zona peligrosa */}
      <h4 className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-[10px] font-semibold uppercase tracking-wider text-danger">
        <AlertTriangle size={10} /> {t("common.dangerZone")}
      </h4>

      <div className="mt-1 space-y-1.5">
        <button
          type="button"
          disabled={!store.npcsUnlocked}
          onClick={() => setConfirm("unlock")}
          className="flex w-full items-center gap-2 rounded-md border border-danger/40 px-2.5 py-2 text-left text-[10px] text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
        >
          <Trash2 size={11} />
          <span>
            <span className="block">{t("easterEgg.removeUnlock")}</span>
            <span className="block text-[10px] text-muted">
              {t("easterEgg.removeUnlockHint")}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setConfirm("all")}
          className="flex w-full items-center gap-2 rounded-md border border-danger/40 px-2.5 py-2 text-left text-[10px] text-danger transition-colors hover:bg-danger/10"
        >
          <Trash2 size={11} />
          <span>
            <span className="block">{t("easterEgg.resetAll")}</span>
            <span className="block text-[10px] text-muted">
              {t("easterEgg.resetAllHint")}
            </span>
          </span>
        </button>

        {isDev && (
          <button
            type="button"
            onClick={() => setConfirm("cloudterm")}
            className="flex w-full items-center gap-2 rounded-md border border-danger/40 px-2.5 py-2 text-left text-[10px] text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 size={11} />
            <span>
              <span className="block">{t("easterEgg.resetCloudTerm")}</span>
              <span className="block text-[10px] text-muted">
                {t("easterEgg.resetCloudTermHint")}
              </span>
            </span>
          </button>
        )}
      </div>

      {/* Utilidades de desarrollo */}
      {isDev && (
        <>
          <h4 className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <Rocket size={10} /> {t("easterEgg.development")}
          </h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              className={ACTION}
              onClick={() => {
                store.unlockNow();
                pushToast("success", t("easterEgg.unlockedDev"), t("easterEgg.unlockedDevDetail"));
              }}
            >
              🚀 {t("easterEgg.unlockAll")}
            </button>
            <button type="button" className={ACTION} onClick={resetEverything}>
              🔄 {t("easterEgg.resetTotal")}
            </button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] text-muted hover:text-text">
              {t("easterEgg.viewInternalState")}
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-bg/60 p-2 font-mono text-[9px] leading-relaxed text-muted">
              {JSON.stringify(
                {
                  npcsUnlocked: store.npcsUnlocked,
                  unlockedAt: store.unlockedAt,
                  unlocksCount: store.unlocksCount,
                  showNpcs: store.showNpcs,
                  discreetMode: store.discreetMode,
                  hiddenUntil: store.hiddenUntil,
                  introPlayed: store.introPlayed,
                  badgeSeen: store.badgeSeen,
                  donateClickTime: store.donateClickTime,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}

      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            title={
              confirm === "unlock"
                ? t("easterEgg.confirmRemoveUnlockTitle")
                : confirm === "all"
                  ? t("easterEgg.confirmResetAllTitle")
                  : t("easterEgg.confirmResetCloudTermTitle")
            }
            detail={
              confirm === "unlock"
                ? t("easterEgg.confirmRemoveUnlockDetail")
                : confirm === "all"
                  ? t("easterEgg.confirmResetAllDetail")
                  : t("easterEgg.confirmResetCloudTermDetail")
            }
            word={confirm === "all" ? "RESET" : "CONFIRMAR"}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              if (confirm === "unlock") removeUnlock();
              else if (confirm === "all") resetEverything();
              else void resetCloudTerm();
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

export default EasterEggSettings;
