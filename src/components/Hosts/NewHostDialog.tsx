import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Server, KeyRound, Lock } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useConnectionStore } from "../../stores/connectionStore";
import type { AuthMethod, ConnectionProtocol } from "../../types";
import { cx } from "../../lib/utils";
import { Field, INPUT, normalizeTimeoutMs } from "./fields";
import { useT } from "../../i18n";

const PROTOCOLS: ConnectionProtocol[] = ["ssh", "sftp", "ftp", "ftps"];

export function NewHostDialog() {
  const t = useT();
  const open = useUiStore((s) => s.newHostOpen);
  const setOpen = useUiStore((s) => s.setNewHostOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const connections = useConnectionStore((s) => s.connections);
  const addConnection = useConnectionStore((s) => s.addConnection);

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [protocol, setProtocol] = useState<ConnectionProtocol>("ssh");
  const [group, setGroup] = useState("General");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("key");
  const [keyPath, setKeyPath] = useState("");
  const [timeoutSec, setTimeoutSec] = useState("60");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(
    () => [...new Set(connections.map((c) => c.group).filter(Boolean))].sort(),
    [connections],
  );

  const close = () => {
    setOpen(false);
    setName("");
    setHost("");
    setPort("");
    setUsername("");
    setKeyPath("");
    setTimeoutSec("60");
    setProtocol("ssh");
    setGroup("General");
    setAuthMethod("key");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !host.trim()) {
      pushToast("warning", t("hosts.missingDataTitle"), t("hosts.missingDataDetail"));
      return;
    }

    setBusy(true);
    const created = await addConnection({
      name: name.trim(),
      host: host.trim(),
      port: port.trim() ? Number(port.trim()) : undefined,
      username: username.trim(),
      protocol,
      group: group.trim() || "General",
      authMethod,
      privateKeyPath: keyPath.trim(),
      timeoutMs: normalizeTimeoutMs(timeoutSec),
    });
    setBusy(false);

    if (created) {
      pushToast("success", t("hosts.savedTitle"), `${created.name} → ${created.host}:${created.port}`);
      void useConnectionStore.getState().refreshStatuses();
      close();
    } else {
      pushToast("error", t("hosts.saveFailedTitle"), t("hosts.saveFailedDetail"));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-[2px]"
          onClick={close}
        >
          <motion.form
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Server size={15} className="text-accent" />
              <h2 className="text-sm font-semibold">{t("hosts.newHostTitle")}</h2>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={close}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
              >
                <X size={14} />
              </button>
            </header>

            <div className="space-y-3 px-4 py-4">
              <Field label={t("common.name")}>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="prod-web-01"
                  className={INPUT}
                />
              </Field>

              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <Field label={t("common.host")}>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.0.2.10"
                    className={INPUT}
                  />
                </Field>
                <Field label={t("common.port")}>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder={t("hosts.portPlaceholder")}
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label={t("common.user")}>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="root"
                    className={INPUT}
                  />
                </Field>
                <Field label={t("common.protocol")}>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as ConnectionProtocol)}
                    className={INPUT}
                  >
                    {PROTOCOLS.map((item) => (
                      <option key={item} value={item}>
                        {item.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                label={t("common.group")}
                hint={t("hosts.existingGroups", {
                  list: groups.join(", ") || t("common.none"),
                })}
              >
                <input
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder={t("hosts.groupPlaceholder")}
                  className={INPUT}
                />
              </Field>

              <Field
                label={t("hosts.timeout")}
                hint={t("hosts.timeoutHintNew")}
              >
                <input
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(e.target.value)}
                  inputMode="numeric"
                  placeholder="60"
                  className={INPUT}
                />
              </Field>

              <div className="space-y-2 rounded-lg border border-border bg-bg/40 p-2.5">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {t("hosts.authentication")}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAuthMethod("key")}
                    className={cx(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                      authMethod === "key"
                        ? "border-accent bg-accent/15 text-text"
                        : "border-border text-muted hover:text-text",
                    )}
                  >
                    <KeyRound size={12} /> {t("hosts.sshKey")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod("password")}
                    className={cx(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                      authMethod === "password"
                        ? "border-accent bg-accent/15 text-text"
                        : "border-border text-muted hover:text-text",
                    )}
                  >
                    <Lock size={12} /> {t("common.password")}
                  </button>
                </div>

                {authMethod === "key" && (
                  <input
                    value={keyPath}
                    onChange={(e) => setKeyPath(e.target.value)}
                    placeholder={t("hosts.keyPathPlaceholder")}
                    className={cx(INPUT, "font-mono text-[11px]")}
                  />
                )}

                <p className="text-[10px] leading-relaxed text-muted">
                  {t("hosts.credentialsNote")}
                </p>
              </div>
            </div>

            <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="ml-auto rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? t("hosts.saving") : t("hosts.saveHost")}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default NewHostDialog;
