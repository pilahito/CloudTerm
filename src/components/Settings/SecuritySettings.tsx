// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  QrCode,
  Copy,
  Check,
  LifeBuoy,
  AlertTriangle,
} from "lucide-react";
import { useSeguridadStore } from "../../stores/seguridadStore";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { copyToClipboard } from "../../lib/links";
import type { Metodo } from "../../lib/seguridad";
import { useT } from "../../i18n";
import { cx } from "../../lib/utils";

const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-[11px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

const BOTON =
  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] transition-colors";

/** En qué paso del alta estamos. */
type Paso = "elegir" | "credenciales" | "escanear" | "recuperacion";

/**
 * Ajustes → Seguridad.
 *
 * Configura el bloqueo de la aplicación. El segundo factor no es opcional: es
 * lo que se pide cuando el acceso a los servidores importa.
 */
export function SecuritySettings() {
  const t = useT();
  const pushToast = useUiStore((s) => s.pushToast);

  const estado = useSeguridadStore((s) => s.estado);
  const alta = useSeguridadStore((s) => s.alta);
  const recuperacion = useSeguridadStore((s) => s.recuperacion);
  const cargando = useSeguridadStore((s) => s.cargando);
  const error = useSeguridadStore((s) => s.error);
  const cargar = useSeguridadStore((s) => s.cargar);
  const empezarAlta = useSeguridadStore((s) => s.empezarAlta);

  // Cuando el método es un proveedor, hay que iniciar sesión con él **aquí
  // mismo**: si no, el segundo factor se quedaría como único paso, y eso no es
  // doble paso. Elegir «Google» y que no pase nada era confuso.
  const cuenta = useAuthStore((s) => s.account);
  const iniciarSesion = useAuthStore((s) => s.signIn);
  const errorAuth = useAuthStore((s) => s.lastSync);
  const confirmarAlta = useSeguridadStore((s) => s.confirmarAlta);
  const cancelarAlta = useSeguridadStore((s) => s.cancelarAlta);
  const quitar = useSeguridadStore((s) => s.quitar);
  const olvidarRecuperacion = useSeguridadStore((s) => s.olvidarRecuperacion);

  const [paso, setPaso] = useState<Paso>("elegir");
  const [metodo, setMetodo] = useState<Metodo>("local");
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [quitando, setQuitando] = useState(false);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras haya códigos de recuperación sin leer, se está en ese paso.
  useEffect(() => {
    if (recuperacion) setPaso("recuperacion");
  }, [recuperacion]);

  const copiar = async (texto: string) => {
    if (await copyToClipboard(texto)) {
      setCopiado(texto);
      window.setTimeout(() => setCopiado(null), 1500);
    }
  };

  const lanzarAlta = async () => {
    // Con un proveedor, primero el navegador: es el primer factor.
    if (metodo !== "local") {
      const proveedor = metodo as "google" | "github";
      if (cuenta?.provider !== proveedor) {
        const resultado = await iniciarSesion(proveedor);
        if (!resultado) {
          // El motivo ya lo deja el store y se enseña abajo.
          return;
        }
      }
    }

    const ok = await empezarAlta(metodo, usuario, contrasena);
    if (ok) {
      setPaso("escanear");
      setContrasena("");
    }
  };

  /** ¿Hace falta iniciar sesión con el proveedor antes de seguir? */
  const faltaSesion = metodo !== "local" && cuenta?.provider !== metodo;

  const confirmar = async () => {
    const ok = await confirmarAlta(codigo);
    if (ok) {
      setCodigo("");
      pushToast("success", t("seguridad.enabled"), t("seguridad.enabledDetail"));
    } else {
      setCodigo("");
    }
  };

  const terminar = () => {
    olvidarRecuperacion();
    setPaso("elegir");
    setUsuario("");
    void cargar();
  };

  const desactivar = async () => {
    const resultado = await quitar(codigo, estado.usuario ?? undefined, contrasena);
    setContrasena("");
    setCodigo("");
    if (resultado.ok) {
      setQuitando(false);
      pushToast("warning", t("seguridad.disabled"), t("seguridad.disabledDetail"));
    }
  };

  /* ------------------------------------------------------------- configurado */

  if (estado.configurado && !quitando) {
    return (
      <section className="mt-2 border-t border-border">
        <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <ShieldCheck size={11} className="text-success" /> {t("seguridad.title")}
        </h3>

        <div className="my-2 space-y-1.5 rounded-lg border border-success/30 bg-success/5 p-2.5">
          <p className="text-[11px] text-text">
            {t("seguridad.activeWith", {
              method: t(`seguridad.method.${estado.metodo ?? "local"}`),
            })}
          </p>
          {estado.usuario && (
            <p className="font-mono text-[10px] text-muted">{estado.usuario}</p>
          )}
          <p className="text-[10px] text-muted">
            {t("seguridad.recoveryLeft", { count: estado.recuperacionRestante })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setQuitando(true)}
          className={cx(BOTON, "mb-2 text-muted hover:border-danger/60 hover:text-danger")}
        >
          <ShieldOff size={11} /> {t("seguridad.disable")}
        </button>
      </section>
    );
  }

  /* ----------------------------------------------------------------- quitar */

  if (quitando) {
    return (
      <section className="mt-2 border-t border-border">
        <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <AlertTriangle size={11} className="text-danger" /> {t("seguridad.disable")}
        </h3>
        <p className="py-1.5 text-[10px] leading-relaxed text-muted">
          {t("seguridad.disableHint")}
        </p>

        <div className="space-y-2 pb-2">
          {estado.metodo === "local" && (
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder={t("common.password")}
              className={INPUT}
            />
          )}
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder={t("seguridad.sixDigitCode")}
            className={cx(INPUT, "font-mono")}
          />
          {error && <p className="text-[10px] text-danger">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={cargando || !codigo}
              onClick={() => void desactivar()}
              className={cx(
                BOTON,
                "border-danger/50 text-danger hover:bg-danger/10",
                (cargando || !codigo) && "opacity-40",
              )}
            >
              {cargando ? <Loader2 size={11} className="animate-spin" /> : <ShieldOff size={11} />}
              {t("seguridad.disableConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setQuitando(false);
                setCodigo("");
                setContrasena("");
              }}
              className={cx(BOTON, "text-muted hover:text-text")}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------- recuperación */

  if (paso === "recuperacion" && recuperacion) {
    return (
      <section className="mt-2 border-t border-border">
        <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <LifeBuoy size={11} className="text-warning" /> {t("seguridad.recoveryTitle")}
        </h3>

        <p className="py-1.5 text-[10px] leading-relaxed text-muted">
          {t("seguridad.recoveryWarning")}
        </p>

        <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg/40 p-2">
          {recuperacion.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void copiar(item)}
              className="flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] text-text hover:bg-elevated"
            >
              {item}
              {copiado === item ? (
                <Check size={10} className="text-success" />
              ) : (
                <Copy size={10} className="text-muted" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 pb-2">
          <button
            type="button"
            onClick={() => void copiar(recuperacion.join("\n"))}
            className={cx(BOTON, "text-muted hover:text-text")}
          >
            <Copy size={11} /> {t("seguridad.copyAll")}
          </button>
          <button
            type="button"
            onClick={terminar}
            className={cx(BOTON, "ml-auto border-accent/50 bg-accent/10 text-text")}
          >
            <Check size={11} /> {t("seguridad.savedRecovery")}
          </button>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ escanear */

  if (paso === "escanear" && alta) {
    return (
      <section className="mt-2 border-t border-border">
        <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <QrCode size={11} className="text-accent" /> {t("seguridad.scanTitle")}
        </h3>

        <p className="py-1.5 text-[10px] leading-relaxed text-muted">
          {t("seguridad.scanHint")}
        </p>

        <div className="mb-2 flex gap-3 rounded-lg border border-border bg-bg/40 p-2.5">
          {/* El QR viene ya renderizado en SVG desde el backend. */}
          <div
            className="h-32 w-32 shrink-0 overflow-hidden rounded [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: alta.qr }}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[10px] text-muted">{t("seguridad.manualHint")}</p>
            <button
              type="button"
              onClick={() => void copiar(alta.secreto)}
              className="flex w-full items-center justify-between gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] text-text hover:bg-elevated"
            >
              <span className="truncate">{alta.secreto}</span>
              {copiado === alta.secreto ? (
                <Check size={10} className="shrink-0 text-success" />
              ) : (
                <Copy size={10} className="shrink-0 text-muted" />
              )}
            </button>
          </div>
        </div>

        <label className="block space-y-1 py-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            {t("seguridad.confirmCode")}
          </span>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className={cx(INPUT, "text-center font-mono text-base tracking-[0.4em]")}
          />
        </label>

        {error && <p className="pb-1 text-[10px] leading-relaxed text-danger">{error}</p>}

        <div className="flex gap-1.5 pb-2">
          <button
            type="button"
            disabled={cargando || codigo.length !== 6}
            onClick={() => void confirmar()}
            className={cx(
              BOTON,
              "border-accent/50 bg-accent/10 text-text",
              (cargando || codigo.length !== 6) && "opacity-40",
            )}
          >
            {cargando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {t("seguridad.activate")}
          </button>
          <button
            type="button"
            onClick={() => {
              cancelarAlta();
              setPaso("elegir");
              setCodigo("");
            }}
            className={cx(BOTON, "text-muted hover:text-text")}
          >
            {t("common.cancel")}
          </button>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------- elegir */

  return (
    <section className="mt-2 border-t border-border">
      <h3 className="flex items-center gap-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <ShieldCheck size={11} /> {t("seguridad.title")}
      </h3>

      <p className="py-1.5 text-[10px] leading-relaxed text-muted">
        {t("seguridad.intro")}
      </p>

      <div className="space-y-2 pb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {t("seguridad.chooseMethod")}
        </span>

        <div className="flex flex-wrap gap-1.5">
          {(["local", "google", "github"] as Metodo[]).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setMetodo(opcion)}
              className={cx(
                BOTON,
                metodo === opcion
                  ? "border-accent bg-accent/15 text-text"
                  : "text-muted hover:text-text",
              )}
            >
              {t(`seguridad.method.${opcion}`)}
            </button>
          ))}
        </div>

        {metodo === "local" && (
          <>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder={t("seguridad.usernamePlaceholder")}
              spellCheck={false}
              className={INPUT}
            />
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder={t("seguridad.passwordPlaceholder")}
              className={INPUT}
            />
          </>
        )}

        <p className="text-[10px] leading-relaxed text-muted">
          {metodo === "local"
            ? t("seguridad.localExplain")
            : t("seguridad.providerExplain")}
        </p>

        {error && <p className="text-[10px] leading-relaxed text-danger">{error}</p>}
        {!error && faltaSesion && errorAuth && (
          <p className="text-[10px] leading-relaxed text-danger">{errorAuth}</p>
        )}

        <button
          type="button"
          disabled={cargando || (metodo === "local" && (!usuario.trim() || contrasena.length < 8))}
          onClick={() => void lanzarAlta()}
          className={cx(
            BOTON,
            "border-accent/50 bg-accent/10 text-text",
            (cargando || (metodo === "local" && (!usuario.trim() || contrasena.length < 8))) &&
              "opacity-40",
          )}
        >
          {cargando ? <Loader2 size={11} className="animate-spin" /> : <QrCode size={11} />}
          {faltaSesion
            ? t("seguridad.signInFirst", { provider: t(`seguridad.method.${metodo}`) })
            : t("seguridad.start")}
        </button>
      </div>
    </section>
  );
}

export default SecuritySettings;
