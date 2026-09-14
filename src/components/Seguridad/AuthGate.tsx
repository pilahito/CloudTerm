// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck, KeyRound, Loader2, LifeBuoy, UserRound } from "lucide-react";
import { useSeguridadStore } from "../../stores/seguridadStore";
import { useT } from "../../i18n";
import { cx } from "../../lib/utils";

const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

/**
 * Pantalla de bloqueo.
 *
 * Cubre toda la aplicación mientras no te hayas identificado. Con método local
 * pide usuario, contraseña y código; cuando identifica Google o GitHub, solo el
 * código, porque la primera mitad ya la demostró el proveedor.
 */
export function AuthGate() {
  const t = useT();
  const estado = useSeguridadStore((s) => s.estado);
  const verificar = useSeguridadStore((s) => s.verificar);
  const error = useSeguridadStore((s) => s.error);

  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const [recuperacion, setRecuperacion] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const primero = useRef<HTMLInputElement | null>(null);
  const esLocal = estado.metodo === "local";

  useEffect(() => {
    primero.current?.focus();
  }, []);

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    await verificar(codigo, esLocal ? usuario : undefined, esLocal ? contrasena : undefined);
    setEnviando(false);
    setCodigo("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] grid place-items-center bg-bg p-6"
    >
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-accent/40 bg-accent/10">
            <ShieldCheck size={20} className="text-accent" />
          </div>
          <h1 className="text-base font-semibold text-text">{t("seguridad.lockedTitle")}</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {esLocal ? t("seguridad.localHint") : t("seguridad.providerHint")}
          </p>
        </div>

        <div className="space-y-2.5 rounded-lg border border-border bg-surface p-4">
          {esLocal && (
            <>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {t("common.user")}
                </span>
                <div className="relative">
                  <UserRound
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    ref={primero}
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    autoComplete="username"
                    spellCheck={false}
                    className={cx(INPUT, "pl-8")}
                  />
                </div>
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {t("common.password")}
                </span>
                <input
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  autoComplete="current-password"
                  className={INPUT}
                />
              </label>
            </>
          )}

          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
              <KeyRound size={10} />
              {recuperacion ? t("seguridad.recoveryCode") : t("seguridad.sixDigitCode")}
            </span>
            <input
              ref={esLocal ? undefined : primero}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode={recuperacion ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={recuperacion ? "ABCD-EFGH" : "000000"}
              maxLength={recuperacion ? 12 : 6}
              className={cx(
                INPUT,
                "text-center font-mono text-lg tracking-[0.3em]",
                !recuperacion && "tracking-[0.4em]",
              )}
            />
          </label>

          {error && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[11px] leading-relaxed text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || codigo.length === 0}
            className={cx(
              "flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-xs font-medium text-accentfg transition-opacity hover:opacity-90",
              (enviando || codigo.length === 0) && "opacity-40",
            )}
          >
            {enviando && <Loader2 size={12} className="animate-spin" />}
            {t("seguridad.unlock")}
          </button>
        </div>

        {/* Si se perdió el móvil, queda este camino. */}
        <button
          type="button"
          onClick={() => {
            setRecuperacion((v) => !v);
            setCodigo("");
          }}
          className="mx-auto flex items-center gap-1.5 text-[10px] text-muted transition-colors hover:text-accent"
        >
          <LifeBuoy size={10} />
          {recuperacion ? t("seguridad.useAppCode") : t("seguridad.useRecovery")}
        </button>
      </form>
    </motion.div>
  );
}

export default AuthGate;
