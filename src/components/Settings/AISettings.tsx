// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { Sparkles, KeyRound, Plug, Loader2, CheckCircle2 } from "lucide-react";
import { useAiStore } from "../../stores/aiStore";
import { useUiStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { aiHasApiKey, aiSetApiKey, aiTestProvider } from "../../lib/ai";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";
import { HardwarePanel } from "./HardwarePanel";

const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-[11px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

/** Ajustes → Asistente IA. */
export function AISettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);
  const aiEnabled = useSettingsStore((s) => s.settings.aiEnabled);
  const updateSettings = useSettingsStore((s) => s.update);

  const config = useAiStore((s) => s.config);
  const load = useAiStore((s) => s.load);
  const updateConfig = useAiStore((s) => s.updateConfig);

  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const provider = config?.providers.find((item) => item.id === config.activeId);
  const reference = provider?.apiKeyEnv ?? null;

  // Se comprueba si hay clave guardada al cambiar de proveedor.
  useEffect(() => {
    if (!reference) {
      setHasKey(false);
      return;
    }
    let alive = true;
    void aiHasApiKey(reference)
      .then((value) => {
        if (alive) setHasKey(value);
      })
      .catch(() => setHasKey(false));
    return () => {
      alive = false;
    };
  }, [reference]);

  const patchProvider = (patch: Partial<NonNullable<typeof provider>>) => {
    if (!config || !provider) return;
    const providers = config.providers.map((item) =>
      item.id === provider.id ? { ...item, ...patch } : item,
    );
    void updateConfig({ providers });
  };

  const saveKey = async () => {
    if (!reference || !apiKey.trim()) return;
    try {
      await aiSetApiKey(reference, apiKey.trim());
      setApiKey("");
      setHasKey(true);
      pushToast("success", t("ai.keySavedToast"), t("ai.keySavedToastDetail"));
    } catch (err) {
      pushToast("error", t("ai.keySaveError"), String(err));
    }
  };

  const test = async () => {
    if (!provider) return;
    setTesting(true);
    try {
      const message = await aiTestProvider(provider.id);
      pushToast("success", t("ai.providerResponds", { provider: provider.label }), message);
    } catch (err) {
      pushToast("error", t("ai.providerNoResponse"), String(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Sparkles size={11} /> {t("ai.title")}
      </h3>

      <div className="flex items-center justify-between gap-6 py-3">
        <div>
          <div className="text-xs text-text">{t("ai.enable")}</div>
          <div className="text-[10px] text-muted">{t("ai.enableHint")}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={aiEnabled}
          onClick={() => updateSettings({ aiEnabled: !aiEnabled })}
          className={cx(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            aiEnabled ? "bg-accent" : "bg-border",
          )}
        >
          <span
            className={cx(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              aiEnabled ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {!config && <p className="py-2 text-[11px] text-muted">{t("ai.loadingConfig")}</p>}

      {config && provider && (
        <>
          <Field label={t("ai.provider")}>
            <select
              value={provider.id}
              onChange={(event) => void updateConfig({ activeId: event.target.value })}
              className={INPUT}
            >
              {config.providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {" · "}
                  {t(
                    item.kind === "ollama" || /127\.0\.0\.1|localhost/i.test(item.baseUrl)
                      ? "common.local"
                      : "common.remote",
                  )}
                </option>
              ))}
            </select>
          </Field>

          <HardwarePanel />

          <Field label={t("ai.baseUrl")} hint={t("ai.baseUrlHint")}>
            <input
              value={provider.baseUrl}
              onChange={(event) => patchProvider({ baseUrl: event.target.value })}
              className={cx(INPUT, "font-mono text-[10px]")}
            />
          </Field>

          <Field
            label={t("ai.model")}
            hint={
              provider.kind === "ollama" ? t("ai.modelHintOllama") : t("ai.modelHintRemote")
            }
          >
            <input
              value={provider.model}
              onChange={(event) => patchProvider({ model: event.target.value })}
              className={cx(INPUT, "font-mono text-[10px]")}
            />
          </Field>

          {reference && (
            <Field
              label={t("ai.apiKey")}
              hint={hasKey ? t("ai.apiKeySaved") : t("ai.apiKeyHint")}
            >
              <div className="flex gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <KeyRound
                    size={11}
                    className={cx("shrink-0", hasKey ? "text-success" : "text-muted")}
                  />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={hasKey ? t("ai.apiKeyPlaceholderSaved") : "sk-…"}
                    className={INPUT}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void saveKey()}
                  disabled={!apiKey.trim()}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-[10px] text-muted transition-colors hover:text-text disabled:opacity-40"
                >
                  {t("common.save")}
                </button>
              </div>
            </Field>
          )}

          <div className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={() => void test()}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-40"
            >
              {testing ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
              {t("ai.test")}
            </button>
            {hasKey && (
              <span className="flex items-center gap-1 text-[10px] text-success">
                <CheckCircle2 size={10} /> {t("ai.keySaved")}
              </span>
            )}
          </div>

          <Field
            label={t("ai.temperature")}
            hint={t("ai.temperatureHint", { value: config.temperature.toFixed(2) })}
          >
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={config.temperature}
              onChange={(event) => void updateConfig({ temperature: Number(event.target.value) })}
              className="w-full accent-[rgb(var(--ct-accent))]"
            />
          </Field>

          <Field label={t("ai.maxTokens")} hint={t("ai.maxTokensHint")}>
            <input
              type="number"
              min={0}
              max={32000}
              step={256}
              value={config.maxTokens}
              onChange={(event) => void updateConfig({ maxTokens: Number(event.target.value) })}
              className={INPUT}
            />
          </Field>

          <Field label={t("ai.systemPrompt")}>
            <textarea
              value={config.systemPrompt}
              onChange={(event) => void updateConfig({ systemPrompt: event.target.value })}
              rows={4}
              className={cx(INPUT, "resize-y leading-relaxed")}
            />
          </Field>
        </>
      )}
    </section>
  );
}

export default AISettings;
