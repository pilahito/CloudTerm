// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Propiedades de un host ya guardado.
 *
 * Además de los datos básicos permite ajustar el **tiempo de espera del
 * handshake**, que es lo que hace falta cuando un servidor tarda decenas de
 * segundos en enviar su banner SSH (típico con `UseDNS yes` y un DNS inverso
 * lento). Sin ese ajuste la conexión se corta antes de empezar.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Server, Activity } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { probeHost } from "../../lib/ssh";
import { cx } from "../../lib/utils";
import { Field, INPUT, normalizeTimeoutMs } from "./fields";
import { useT } from "../../i18n";

export function HostSettingsDialog() {
  const t = useT();
  const id = useUiStore((s) => s.hostSettingsId);
  const setHostSettingsId = useUiStore((s) => s.setHostSettingsId);
  const pushToast = useUiStore((s) => s.pushToast);
  const connections = useConnectionStore((s) => s.connections);
  const updateConnection = useConnectionStore((s) => s.updateConnection);

  const connection = useMemo(
    () => connections.find((c) => c.id === id) ?? null,
    [connections, id],
  );

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [group, setGroup] = useState("");
  const [timeoutSec, setTimeoutSec] = useState("60");
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<string | null>(null);

  // Al abrir otro host se recargan los campos con sus valores.
  useEffect(() => {
    if (!connection) return;
    setName(connection.name);
    setHost(connection.host);
    setPort(String(connection.port));
    setUsername(connection.username);
    setGroup(connection.group);
    setTimeoutSec(String(Math.round((connection.timeoutMs ?? 60_000) / 1000)));
    setProbe(null);
  }, [connection]);

  const close = () => setHostSettingsId(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!connection) return;
    if (!name.trim() || !host.trim()) {
      pushToast("warning", t("hosts.missingDataTitle"), t("hosts.missingDataDetail"));
      return;
    }

    const parsedPort = Number(port.trim());
    setBusy(true);
    await updateConnection(connection.id, {
      name: name.trim(),
      host: host.trim(),
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : connection.port,
      username: username.trim(),
      group: group.trim() || "General",
      timeoutMs: normalizeTimeoutMs(timeoutSec),
    });
    setBusy(false);

    pushToast("success", t("hosts.updatedTitle"), `${name.trim()} → ${host.trim()}`);
    void useConnectionStore.getState().refreshStatuses();
    close();
  };

  /** Sondea el host con el tiempo de espera que hay escrito en el formulario. */
  const testConnection = async () => {
    if (!host.trim()) return;
    const parsedPort = Number(port.trim());
    setProbe(t("hosts.testing"));
    try {
      const result = await probeHost(
        host.trim(),
        Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 22,
        normalizeTimeoutMs(timeoutSec),
      );
      setProbe(
        result.reachable
          ? `${result.message} · ${result.latencyMs} ms${result.banner ? ` · ${result.banner}` : ""}`
          : result.message,
      );
    } catch (err) {
      setProbe(String(err));
    }
  };

  return (
    <AnimatePresence>
      {connection && (
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
              <h2 className="text-sm font-semibold">{t("hosts.propertiesTitle")}</h2>
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
                  className={INPUT}
                />
              </Field>

              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <Field label={t("common.host")}>
                  <input value={host} onChange={(e) => setHost(e.target.value)} className={INPUT} />
                </Field>
                <Field label={t("common.port")}>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label={t("common.user")}>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field label={t("common.group")}>
                  <input value={group} onChange={(e) => setGroup(e.target.value)} className={INPUT} />
                </Field>
              </div>

              <Field
                label={t("hosts.timeout")}
                hint={t("hosts.timeoutHintSettings")}
              >
                <input
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(e.target.value)}
                  inputMode="numeric"
                  className={INPUT}
                />
              </Field>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void testConnection()}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                >
                  <Activity size={12} /> {t("hosts.testConnection")}
                </button>
                {probe && (
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted" title={probe}>
                    {probe}
                  </span>
                )}
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
                className={cx(
                  "ml-auto rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90",
                  busy && "opacity-40",
                )}
              >
                {busy ? t("hosts.saving") : t("common.saveChanges")}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HostSettingsDialog;
