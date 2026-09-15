// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import {
  UserRound,
  LogOut,
  CloudUpload,
  CloudDownload,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { onDeviceCode, providerLabel, type AuthProvider } from "../../lib/auth";
import { openExternal } from "../../lib/links";
import { ProviderIcon } from "../Brand";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-[11px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

/** Dónde se crea cada aplicación de cliente. */
const CONSOLES: Record<AuthProvider, { url: string; hintKey: string }> = {
  google: {
    url: "https://console.cloud.google.com/apis/credentials",
    hintKey: "account.googleHint",
  },
  github: {
    url: "https://github.com/settings/developers",
    hintKey: "account.githubHint",
  },
};

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

/** Ajustes → Cuenta. */
export function AccountSettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);
  const settings = useSettingsStore((s) => s.settings);

  const config = useAuthStore((s) => s.config);
  const account = useAuthStore((s) => s.account);
  const busy = useAuthStore((s) => s.busy);
  const device = useAuthStore((s) => s.device);
  const syncing = useAuthStore((s) => s.syncing);
  const lastSync = useAuthStore((s) => s.lastSync);
  const load = useAuthStore((s) => s.load);
  const saveConfig = useAuthStore((s) => s.saveConfig);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const setDevice = useAuthStore((s) => s.setDevice);
  const push = useAuthStore((s) => s.push);
  const pull = useAuthStore((s) => s.pull);

  const [googleId, setGoogleId] = useState("");
  const [githubId, setGithubId] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setGoogleId(config.googleClientId);
    setGithubId(config.githubClientId);
  }, [config.googleClientId, config.githubClientId]);

  // El código de GitHub llega por evento, no como respuesta del comando: el
  // comando no termina hasta que el usuario autoriza.
  useEffect(() => {
    let alive = true;
    let off: (() => void) | null = null;

    void onDeviceCode((code) => {
      if (alive) setDevice(code);
    })
      .then((unlisten) => {
        if (alive) off = unlisten;
        else unlisten();
      })
      .catch(() => {
        /* sin Tauri no hay eventos */
      });

    return () => {
      alive = false;
      off?.();
    };
  }, [setDevice]);

  const configChanged =
    googleId.trim() !== config.googleClientId || githubId.trim() !== config.githubClientId;

  const onSave = async () => {
    const ok = await saveConfig({
      googleClientId: googleId.trim(),
      githubClientId: githubId.trim(),
    });
    if (ok) {
      pushToast("success", t("account.credentialsSaved"), t("account.credentialsSavedDetail"));
    } else {
      pushToast("error", t("account.saveFailed"), t("account.saveFailedDetail"));
    }
  };

  const onSignIn = async (provider: AuthProvider) => {
    const id = provider === "google" ? googleId.trim() : githubId.trim();
    if (!id) {
      pushToast(
        "warning",
        t("account.missingClientId", { provider: providerLabel(provider) }),
        t("account.missingClientIdDetail"),
      );
      return;
    }

    const result = await signIn(provider);
    if (result) {
      pushToast(
        "success",
        t("account.signedIn", { provider: providerLabel(provider) }),
        result.email || result.name,
      );
    } else {
      const detail = useAuthStore.getState().lastSync;
      pushToast(
        "error",
        t("account.signInFailed", { provider: providerLabel(provider) }),
        detail ?? undefined,
      );
    }
  };

  const onPush = async () => {
    const outcome = await push(settings);
    if (outcome) {
      pushToast(
        "success",
        t("account.backupSaved"),
        t("account.backupSavedDetail", {
          count: outcome.hosts,
          destination: outcome.destination,
        }),
      );
    } else {
      pushToast(
        "error",
        t("account.backupSaveFailed"),
        useAuthStore.getState().lastSync ?? undefined,
      );
    }
  };

  const onPull = async () => {
    const outcome = await pull();
    if (!outcome) {
      pushToast(
        "error",
        t("account.restoreFailed"),
        useAuthStore.getState().lastSync ?? undefined,
      );
      return;
    }

    // Los ajustes también viajan en la copia: se aplican sobre los actuales.
    if (outcome.settings && typeof outcome.settings === "object") {
      useSettingsStore.getState().update(outcome.settings as Partial<typeof settings>);
    }

    pushToast(
      "success",
      t("account.backupRestored"),
      t("account.backupRestoredDetail", { count: outcome.hosts }),
    );
    void useConnectionStore.getState().load();
  };

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <UserRound size={11} /> {t("account.title")}
      </h3>

      <p className="py-1.5 text-[10px] leading-relaxed text-muted">
        {t("account.intro1")}{" "}
        <strong className="text-text">{t("account.introEmphasis")}</strong>{" "}
        {t("account.intro2")}
      </p>

      {account ? (
        <div className="space-y-2 py-2">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-bg/40 p-2.5">
            {account.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-elevated text-muted">
                <UserRound size={14} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-text">{account.name || account.id}</div>
              <div className="truncate text-[10px] text-muted">
                {account.email || t("account.noPublicEmail")} ·{" "}
                {providerLabel(account.provider)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut(account.provider)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:text-danger"
            >
              <LogOut size={10} /> {t("account.signOut")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={syncing}
              onClick={() => void onPush()}
              className={cx(
                "flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90",
                syncing && "opacity-40",
              )}
            >
              {syncing ? <Loader2 size={11} className="animate-spin" /> : <CloudUpload size={11} />}
              {t("account.backupSave")}
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void onPull()}
              className={cx(
                "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-text",
                syncing && "opacity-40",
              )}
            >
              <CloudDownload size={11} /> {t("account.restore")}
            </button>
          </div>

          <p className="text-[10px] text-muted">
            {t("account.restoreWarning1")}{" "}
            <strong className="text-text">{t("account.restoreWarningEmphasis")}</strong>{" "}
            {t("account.restoreWarning2")}
          </p>
        </div>
      ) : (
        <div className="space-y-3 py-2">
          {(["google", "github"] as AuthProvider[]).map((provider) => {
            const value = provider === "google" ? googleId : githubId;
            const setValue = provider === "google" ? setGoogleId : setGithubId;
            const console = CONSOLES[provider];
            const waiting = busy === provider;

            return (
              <div key={provider} className="rounded-lg border border-border bg-bg/40 p-2.5">
                <Field
                  label={t("account.clientIdLabel", { provider: providerLabel(provider) })}
                  hint={t(console.hintKey)}
                >
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={provider === "google" ? "1234-abc.apps.googleusercontent.com" : "Ov23li…"}
                    className={cx(INPUT, "font-mono")}
                  />
                </Field>

                {/* El paso que bloquea a todo el mundo es crear la aplicación de
                    cliente. Se abre la consola del proveedor con un clic, en vez
                    de dejar una URL truncada que nadie copia a mano. */}
                <button
                  type="button"
                  onClick={() => void openExternal(console.url)}
                  className="mb-1.5 flex w-full items-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-left text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text"
                >
                  <ExternalLink size={10} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    {t("account.createApp", { provider: providerLabel(provider) })}
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void onSignIn(provider)}
                    className={cx(
                      "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-accent/60",
                      busy && !waiting && "opacity-40",
                    )}
                  >
                    {waiting ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      // La marca del proveedor, no un icono genérico: se ve de
                      // un vistazo con cuál vas a entrar.
                      <ProviderIcon provider={provider} size={12} />
                    )}
                    {waiting
                      ? provider === "github"
                        ? t("account.waitingAuthorization")
                        : t("account.waitingBrowser")
                      : t("account.signInWith", { provider: providerLabel(provider) })}
                  </button>
                </div>

                {/* El flujo de GitHub muestra un código que hay que escribir. */}
                {waiting && provider === "github" && device && (
                  <div className="mt-2 rounded-md border border-accent/40 bg-accent/10 p-2">
                    <div className="text-[10px] text-muted">
                      {t("account.deviceCodeInstruction", { uri: device.verificationUri })}
                    </div>
                    <div className="font-mono text-base tracking-[0.2em] text-accent">
                      {device.userCode}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            disabled={!configChanged}
            onClick={() => void onSave()}
            className={cx(
              "rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90",
              !configChanged && "opacity-40",
            )}
          >
            {configChanged ? t("account.saveCredentials") : t("account.credentialsStored")}
          </button>
        </div>
      )}

      {lastSync && !account && (
        <p className="pb-2 text-[10px] leading-relaxed text-muted">{lastSync}</p>
      )}
    </section>
  );
}

export default AccountSettings;
