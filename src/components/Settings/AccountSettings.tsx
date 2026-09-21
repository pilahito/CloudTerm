// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import {
  UserRound,
  LogOut,
  CloudUpload,
  CloudDownload,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { providerLabel, type AuthProvider } from "../../lib/auth";
import { ProviderIcon } from "../Brand";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-[11px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

function isPlaceholder(value: string) {
  const v = value.trim().toLowerCase();
  return !v || v.startsWith("1234-abc") || v.startsWith("ov23li") || v.includes("…") || v.includes("...");
}

export function AccountSettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);
  const settings = useSettingsStore((s) => s.settings);

  const config = useAuthStore((s) => s.config);
  const account = useAuthStore((s) => s.account);
  const busy = useAuthStore((s) => s.busy);
  const syncing = useAuthStore((s) => s.syncing);
  const lastSync = useAuthStore((s) => s.lastSync);
  const load = useAuthStore((s) => s.load);
  const saveConfig = useAuthStore((s) => s.saveConfig);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const push = useAuthStore((s) => s.push);
  const pull = useAuthStore((s) => s.pull);

  const [googleId, setGoogleId] = useState("");
  const [githubId, setGithubId] = useState("");
  const [githubSecret, setGithubSecret] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const hasGithubSecret = useAuthStore((s) => s.hasGithubSecret);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setGoogleId(config.googleClientId);
    setGithubId(config.githubClientId);
  }, [config.googleClientId, config.githubClientId]);

  const persistIds = async () => {
    const g = isPlaceholder(googleId) ? config.googleClientId : googleId.trim();
    const h = isPlaceholder(githubId) ? config.githubClientId : githubId.trim();
    if (g !== config.googleClientId || h !== config.githubClientId || githubSecret.trim() !== "") {
      await saveConfig({
        googleClientId: g,
        githubClientId: h,
        githubClientSecret: githubSecret.trim() || undefined,
      });
      setGithubSecret("");
    }
  };

  const onSignIn = async (provider: AuthProvider) => {
    await persistIds();
    const result = await signIn(provider);
    if (result) {
      pushToast("success", t("account.signedIn", { provider: providerLabel(provider) }), result.email || result.name);
    } else {
      pushToast("error", t("account.signInFailed", { provider: providerLabel(provider) }), useAuthStore.getState().lastSync ?? undefined);
    }
  };

  const onPush = async () => {
    const outcome = await push(settings);
    if (outcome) {
      pushToast("success", t("account.backupSaved"), t("account.backupSavedDetail", { count: outcome.hosts, destination: outcome.destination }));
    } else {
      pushToast("error", t("account.backupSaveFailed"), useAuthStore.getState().lastSync ?? undefined);
    }
  };

  const onPull = async () => {
    const outcome = await pull();
    if (!outcome) {
      pushToast("error", t("account.restoreFailed"), useAuthStore.getState().lastSync ?? undefined);
      return;
    }
    if (outcome.settings && typeof outcome.settings === "object") {
      useSettingsStore.getState().update(outcome.settings as Partial<typeof settings>);
    }
    pushToast("success", t("account.backupRestored"), t("account.backupRestoredDetail", { count: outcome.hosts }));
    void useConnectionStore.getState().load();
  };

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <UserRound size={11} /> {t("account.title")}
      </h3>
      <p className="py-1.5 text-[10px] leading-relaxed text-muted">
        Pulsa el botón: se abre el navegador, inicias sesión y vuelves. No hay que copiar códigos.
      </p>
      {account ? (
        <div className="space-y-2 py-2">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-bg/40 p-2.5">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-elevated text-muted">
                <UserRound size={14} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-text">{account.name || account.id}</div>
              <div className="truncate text-[10px] text-muted">
                {account.email || t("account.noPublicEmail")} · {providerLabel(account.provider)}
              </div>
            </div>
            <button type="button" onClick={() => void signOut(account.provider)} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted hover:text-danger">
              <LogOut size={10} /> {t("account.signOut")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={syncing} onClick={() => void onPush()} className={cx("flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accentfg", syncing && "opacity-40")}>
              {syncing ? <Loader2 size={11} className="animate-spin" /> : <CloudUpload size={11} />}
              {t("account.backupSave")}
            </button>
            <button type="button" disabled={syncing} onClick={() => void onPull()} className={cx("flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted", syncing && "opacity-40")}>
              <CloudDownload size={11} /> {t("account.restore")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 py-2">
          {(["google", "github"] as AuthProvider[]).map((provider) => {
            const waiting = busy === provider;
            return (
              <button key={provider} type="button" disabled={Boolean(busy)} onClick={() => void onSignIn(provider)} className={cx("flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg/40 px-3 py-2.5 text-[12px] text-text hover:border-accent/60", busy && !waiting && "opacity-40")}>
                {waiting ? <Loader2 size={14} className="animate-spin" /> : <ProviderIcon provider={provider} size={14} />}
                {waiting ? t("account.waitingBrowser") : t("account.signInWith", { provider: providerLabel(provider) })}
              </button>
            );
          })}
          {busy && <p className="text-[10px] leading-relaxed text-muted">{t("account.browserOpened")}</p>}
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1 text-[10px] text-muted hover:text-text">
            <ChevronDown size={10} className={advanced ? "rotate-180" : ""} />
            Avanzado
          </button>
          {advanced && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-2">
              <Field label={t("account.clientIdLabel", { provider: "Google" })}>
                <input value={googleId} onChange={(e) => setGoogleId(e.target.value)} className={cx(INPUT, "font-mono")} />
              </Field>
              <Field label={t("account.clientIdLabel", { provider: "GitHub" })}>
                <input value={githubId} onChange={(e) => setGithubId(e.target.value)} className={cx(INPUT, "font-mono")} />
              </Field>
              <Field label={t("account.githubSecretLabel")} hint={hasGithubSecret ? t("account.githubSecretStored") : t("account.githubSecretHint")}>
                <input type="password" value={githubSecret} onChange={(e) => setGithubSecret(e.target.value)} autoComplete="off" className={cx(INPUT, "font-mono")} />
              </Field>
            </div>
          )}
        </div>
      )}
      {lastSync && !account && <p className="pb-2 text-[10px] leading-relaxed text-muted">{lastSync}</p>}
    </section>
  );
}

export default AccountSettings;
