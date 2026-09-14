import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { KeyRound, Lock, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { useSshStore, type PendingAuth } from "../../stores/sshStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useUiStore } from "../../stores/uiStore";
import { saveSecret, secretKey, type SshAuthSpec } from "../../lib/ssh";
import type { AuthMethod } from "../../types";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

function MethodTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
        active
          ? "border-accent bg-accent/15 text-text"
          : "border-border text-muted hover:text-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AuthDialog({ pending }: { pending: PendingAuth }) {
  const t = useT();
  const resolve = useSshStore((s) => s.resolveCredentials);
  const updateConnection = useConnectionStore((s) => s.updateConnection);
  const pushToast = useUiStore((s) => s.pushToast);

  const { connection, hint } = pending;

  const [method, setMethod] = useState<AuthMethod>(connection.authMethod);
  const [password, setPassword] = useState("");
  const [keyPath, setKeyPath] = useState(connection.privateKeyPath ?? "");
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(true);

  const target = `${connection.username}@${connection.host}:${connection.port}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const auth: SshAuthSpec =
      method === "password"
        ? { kind: "password", password }
        : { kind: "key", keyPath: keyPath.trim() || null, passphrase: passphrase || null };

    if (method === "password" && !password) {
      pushToast("warning", t("auth.missingPassword"), target);
      return;
    }

    // Recordar el método elegido en la conexión, para la próxima vez.
    void updateConnection(connection.id, {
      authMethod: method,
      privateKeyPath: method === "key" ? keyPath.trim() : connection.privateKeyPath,
      useAgent: false,
    });

    if (remember) {
      const secret = method === "password" ? password : passphrase;
      if (secret) {
        await saveSecret(secretKey(connection), secret);
        pushToast("success", t("auth.savedToKeychain"), target);
      }
    }

    resolve(auth);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[55] grid place-items-center bg-black/50 p-6 backdrop-blur-[2px]"
      onClick={() => resolve(null)}
    >
      <motion.form
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ShieldCheck size={15} className="text-accent" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">{t("auth.title")}</h2>
            <p className="truncate text-[10px] text-muted">{target}</p>
          </div>
          <button
            type="button"
            aria-label={t("common.cancel")}
            onClick={() => resolve(null)}
            className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
          >
            <X size={14} />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          {hint && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[10px] leading-relaxed text-warning">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {hint}
            </p>
          )}

          <div className="flex gap-1.5">
            <MethodTab
              active={method === "password"}
              icon={<Lock size={12} />}
              label={t("common.password")}
              onClick={() => setMethod("password")}
            />
            <MethodTab
              active={method === "key"}
              icon={<KeyRound size={12} />}
              label={t("auth.sshKey")}
              onClick={() => setMethod("key")}
            />
          </div>

          {method === "password" ? (
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {t("common.password")}
              </span>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-xs text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
              />
            </label>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {t("auth.privateKeyPath")}
                </span>
                <input
                  autoFocus
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                  placeholder={t("auth.keyPathPlaceholder")}
                  className="w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 font-mono text-[11px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {t("auth.passphrase")}{" "}
                  <span className="normal-case">{t("auth.passphraseIfEncrypted")}</span>
                </span>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={t("auth.optional")}
                  className="w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-xs text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                />
              </label>
            </>
          )}

          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--ct-accent))]"
            />
            <span className="text-[10px] text-muted">
              {t("auth.saveToKeychain")}
            </span>
          </label>
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => resolve(null)}
            className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
          >
            {t("auth.connect")}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

export function SshAuthModal() {
  const pending = useSshStore((s) => s.pendingAuth);

  return (
    <AnimatePresence>
      {pending && <AuthDialog key={`${pending.sessionId}-${pending.attempt}`} pending={pending} />}
    </AnimatePresence>
  );
}

export default SshAuthModal;
