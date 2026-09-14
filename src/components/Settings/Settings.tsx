// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { motion, AnimatePresence } from "motion/react";
import { X, RotateCcw, Palette, Type, ShieldCheck } from "lucide-react";
import { useSettingsStore, THEMES, DEFAULT_SETTINGS } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { KnownHostsSettings } from "./KnownHostsSettings";
import { AISettings } from "./AISettings";
import { AccountSettings } from "./AccountSettings";
import { LanguageSettings } from "./LanguageSettings";
import { SecuritySettings } from "./SecuritySettings";
import { EasterEggSettings } from "./EasterEggSettings";
import { useEasterEggStore } from "../../stores/easterEggStore";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-xs text-text">{label}</div>
        {hint && <div className="text-[10px] text-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cx(
        "relative h-5 w-9 rounded-full transition-colors",
        value ? "bg-accent" : "bg-border",
      )}
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

export function Settings() {
  const t = useT();
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const settings = useSettingsStore((s) => s.settings);
  // La sección solo aparece si hay algo que enseñar… o si estamos en desarrollo.
  const npcsUnlocked = useEasterEggStore((s) => s.npcsUnlocked);
  const showEasterEggs = npcsUnlocked || import.meta.env.DEV;
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);

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
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Palette size={15} className="text-accent" />
              <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
              <button
                type="button"
                aria-label={t("settings.closeAria")}
                onClick={() => setOpen(false)}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
              <section>
                <h3 className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {t("settings.appearance")}
                </h3>
                <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => update({ theme: theme.id })}
                        className={cx(
                          "rounded-md border px-2 py-1 text-[11px] transition-colors",
                          settings.theme === theme.id
                            ? "border-accent bg-accent/15 text-text"
                            : "border-border text-muted hover:text-text",
                        )}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label={t("settings.fontSize")} hint={`${settings.fontSize} px`}>
                  <input
                    type="range"
                    min={9}
                    max={28}
                    value={settings.fontSize}
                    onChange={(e) => update({ fontSize: Number(e.target.value) })}
                    className="w-40 accent-[rgb(var(--ct-accent))]"
                  />
                </Row>
                <Row label={t("settings.cursorBlink")}>
                  <Toggle value={settings.cursorBlink} onChange={(v) => update({ cursorBlink: v })} />
                </Row>
              </section>

              <section className="mt-2 border-t border-border">
                <h3 className="pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {t("settings.terminal")}
                </h3>
                <Row label={t("settings.fontFamily")}>
                  <input
                    value={settings.fontFamily}
                    onChange={(e) => update({ fontFamily: e.target.value })}
                    className="w-64 rounded-md border border-border bg-bg/60 px-2 py-1 text-[11px] text-text focus:border-accent/60 focus:outline-none"
                  />
                </Row>
                <Row label={t("settings.scrollback")} hint={t("settings.scrollbackHint")}>
                  <input
                    type="number"
                    min={500}
                    max={100000}
                    step={500}
                    value={settings.scrollback}
                    onChange={(e) => update({ scrollback: Number(e.target.value) })}
                    className="w-28 rounded-md border border-border bg-bg/60 px-2 py-1 text-[11px] text-text focus:border-accent/60 focus:outline-none"
                  />
                </Row>
                <Row label={t("settings.copyOnSelect")}>
                  <Toggle value={settings.copyOnSelect} onChange={(v) => update({ copyOnSelect: v })} />
                </Row>
                <Row label={t("settings.confirmOnClose")}>
                  <Toggle
                    value={settings.confirmOnClose}
                    onChange={(v) => update({ confirmOnClose: v })}
                  />
                </Row>
              </section>

              <SecuritySettings />

              <AISettings />

              <LanguageSettings />

              <AccountSettings />

              <KnownHostsSettings />

              {showEasterEggs && <EasterEggSettings />}

              <section className="mt-2 border-t border-border">
                <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <ShieldCheck size={11} /> {t("settings.secureStorage")}
                </h3>
                <p className="py-2 text-[11px] leading-relaxed text-muted">
                  {t("settings.secureStorageBodyIntro")}{" "}
                  <code className="text-text">keyring</code>{" "}
                  {t("settings.secureStorageBodyDetail")}
                </p>
              </section>
            </div>

            <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
              <span className="flex items-center gap-1.5 text-[10px] text-muted">
                <Type size={11} /> {t("settings.autoSave")}
              </span>
              <button
                type="button"
                onClick={() => {
                  reset();
                  pushToast(
                    "info",
                    t("settings.resetToastTitle"),
                    t("settings.resetToastDetail", { theme: DEFAULT_SETTINGS.theme }),
                  );
                }}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-danger/60 hover:text-danger"
              >
                <RotateCcw size={12} />
                {t("settings.reset")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
              >
                {t("settings.done")}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Settings;
