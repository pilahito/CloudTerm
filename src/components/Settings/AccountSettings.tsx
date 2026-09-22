// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import {
  UserRound,
  LogOut,
  CloudUpload,
  CloudDownload,
  Loader2,
  ShieldCheck,
  AlertTriangle,
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

/**
 * Editor del identificador de cliente de un proveedor.
 *
 * El botón «Guardar» es el que hace desaparecer la alerta roja: en cuanto hay un
 * identificador válido —propio o integrado— el proveedor queda «listo» y la
 * alerta deja de mostrarse.
 */
function CredentialEditor({
  provider,
  value,
  onChange,
  onSave,
  saving,
  ready,
  builtIn,
}: {
  provider: AuthProvider;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  ready: boolean;
  builtIn: boolean;
}) {
  const t = useT();
  const name = providerLabel(provider);
  const dirty = value.trim().length > 0;

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2">
      {builtIn && (
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
          <ShieldCheck size={11} className="mt-px shrink-0 text-accent" />
          <span>
            <span className="text-text">{t("account.builtInReady", { provider: name })}.</span>{" "}
            {t("account.builtInReadyDetail", { provider: name })}
          </span>
        </p>
      )}

      <Field
        label={t("account.clientIdLabel", { provider: name })}
        hint={provider === "google" ? t("account.googleHint") : t("account.githubHint")}
      >
        <div className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="1234…apps.googleusercontent.com"
            className={cx(INPUT, "font-mono")}
          />
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className={cx(
              "shrink-0 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text hover:border-accent/60",
              (saving || !dirty) && "opacity-40",
            )}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : t("account.saveClientId")}
          </button>
        </div>
      </Field>

      {!ready && (
        <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11px] leading-relaxed text-danger">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          <span>
            <span className="font-medium">
              {t("account.missingClientId", { provider: name })}
            </span>
            <span className="block text-danger/90">{t("account.missingClientIdDetail")}</span>
          </span>
        </p>
      )}
    </div>
  );
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

  const googleReady = useAuthStore((s) => s.googleReady);
  const githubReady = useAuthStore((s) => s.githubReady);
  const googleBuiltIn = useAuthStore((s) => s.googleBuiltIn);
  const githubBuiltIn = useAuthStore((s) => s.githubBuiltIn);
  const hasGithubSecret = useAuthStore((s) => s.hasGithubSecret);

  const [googleId, setGoogleId] = useState("");
  const [githubId, setGithubId] = useState("");
  const [githubSecret, setGithubSecret] = useState("");
  const [savingId, setSavingId] = useState<AuthProvider | null>(null);
  const [editing, setEditing] = useState<AuthProvider | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Lo guardado manda: al llegar del backend se rellena el campo con lo que hay.
  useEffect(() => {
    setGoogleId(config.googleClientId);
    setGithubId(config.githubClientId);
  }, [config.googleClientId, config.githubClientId]);

  const readyOf = (provider: AuthProvider) =>
    provider === "google" ? googleReady : githubReady;
  const builtInOf = (provider: AuthProvider) =>
    provider === "google" ? googleBuiltIn : githubBuiltIn;
  const valueOf = (provider: AuthProvider) => (provider === "google" ? googleId : githubId);

  /**
   * Guarda el identificador de un proveedor y avisa del resultado.
   *
   * Se guardan también los del otro proveedor para no perder lo ya escrito.
   */
  const saveClientId = async (provider: AuthProvider) => {
    const own = valueOf(provider).trim();
    if (!own) return;

    setSavingId(provider);
    try {
      const next = {
        googleClientId: provider === "google" ? own : googleId.trim(),
        githubClientId: provider === "github" ? own : githubId.trim(),
        // El secreto solo viaja cuando el usuario escribe uno nuevo.
        githubClientSecret: githubSecret.trim() || undefined,
      };
      const ok = await saveConfig(next);
      if (!ok) {
        pushToast("error", t("account.saveFailed"), t("account.saveFailedDetail"));
        return;
      }
      setGithubSecret("");
      // Si el proveedor ya tiene identificador, la alerta roja desaparece aquí.
      setEditing(null);
      pushToast(
        "success",
        t("account.credentialsSaved"),
        t("account.credentialsSavedDetail"),
      );
    } finally {
      setSavingId(null);
    }
  };

  const onSignIn = async (provider: AuthProvider) => {
    const result = await signIn(provider);
    if (result) {
      pushToast(
        "success",
        t("account.signedIn", { provider: providerLabel(provider) }),
        result.email || result.name,
      );
    } else {
      pushToast(
        "error",
        t("account.signInFailed", { provider: providerLabel(provider) }),
        useAuthStore.getState().lastSync ?? undefined,
      );
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
            const ready = readyOf(provider);
            const builtIn = builtInOf(provider);
            const busyElsewhere = Boolean(busy) && !waiting;
            const showEditor = editing === provider || !ready;

            return (
              <div key={provider} className="space-y-2">
                <button
                  type="button"
                  // Solo se puede pulsar cuando hay credenciales: propias o integradas.
                  disabled={!ready || Boolean(busy)}
                  onClick={() => void onSignIn(provider)}
                  className={cx(
                    "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg/40 px-3 py-2.5 text-[12px] text-text hover:border-accent/60",
                    (!ready || busyElsewhere) && "opacity-40",
                    !ready && "cursor-not-allowed",
                  )}
                >
                  {waiting ? <Loader2 size={14} className="animate-spin" /> : <ProviderIcon provider={provider} size={14} />}
                  {waiting
                    ? t("account.waitingBrowser")
                    : t("account.signInWith", { provider: providerLabel(provider) })}
                </button>

                {showEditor && (
                  <CredentialEditor
                    provider={provider}
                    value={valueOf(provider)}
                    onChange={provider === "google" ? setGoogleId : setGithubId}
                    onSave={() => void saveClientId(provider)}
                    saving={savingId === provider}
                    ready={ready}
                    builtIn={builtIn}
                  />
                )}

                {/* El secreto solo tiene sentido si el usuario pone su propia app. */}
                {provider === "github" && showEditor && (
                  <Field
                    label={t("account.githubSecretLabel")}
                    hint={
                      hasGithubSecret
                        ? t("account.githubSecretStored")
                        : t("account.githubSecretHint")
                    }
                  >
                    <input
                      type="password"
                      value={githubSecret}
                      onChange={(e) => setGithubSecret(e.target.value)}
                      autoComplete="off"
                      className={cx(INPUT, "font-mono")}
                    />
                  </Field>
                )}

                {/* Con credenciales integradas, deja cambiar a las propias. */}
                {ready && builtIn && editing !== provider && (
                  <button
                    type="button"
                    onClick={() => setEditing(provider)}
                    className="text-[10px] text-muted hover:text-accent"
                  >
                    {t("account.clientIdOwn", { provider: providerLabel(provider) })}
                  </button>
                )}
              </div>
            );
          })}

          {busy && (
            <p className="text-[10px] leading-relaxed text-muted">{t("account.browserOpened")}</p>
          )}
        </div>
      )}
      {lastSync && !account && <p className="pb-2 text-[10px] leading-relaxed text-muted">{lastSync}</p>}
    </section>
  );
}

export default AccountSettings;
