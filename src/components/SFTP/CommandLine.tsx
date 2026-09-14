// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useRef, useState } from "react";
import { Terminal, Loader2, Trash2, CornerDownLeft } from "lucide-react";
import { execLine, sinPrefijo, type ExecOutput } from "../../lib/cmd";
import { useT } from "../../i18n";
import { cx } from "../../lib/utils";

/** Una línea del historial de la consola. */
interface Entry {
  id: number;
  /** Lo que escribió el usuario, tal cual. */
  line: string;
  scope: "remote" | "local";
  running: boolean;
  output?: ExecOutput;
  error?: string;
}

interface Props {
  /** Sesión SFTP sobre la que ejecutar. Sin ella solo funcionan los `!`. */
  sessionId: string | null;
  /** `true` cuando el panel está en modo clásico: todo más denso. */
  compacto?: boolean;
}

/**
 * Consola del gestor de archivos.
 *
 * Un comando normal se ejecuta en el servidor; con `!` delante, en el equipo
 * local. El historial se navega con las flechas, como en cualquier terminal.
 */
export function CommandLine({ sessionId, compacto = false }: Props) {
  const t = useT();
  const [entradas, setEntradas] = useState<Entry[]>([]);
  const [linea, setLinea] = useState("");
  const [historial, setHistorial] = useState<string[]>([]);
  const [posicion, setPosicion] = useState(-1);
  const [ocupado, setOcupado] = useState(false);

  const contador = useRef(0);
  const salidaRef = useRef<HTMLDivElement | null>(null);
  const entradaRef = useRef<HTMLInputElement | null>(null);

  // La salida se desplaza sola hacia abajo, como en una terminal de verdad.
  useEffect(() => {
    const nodo = salidaRef.current;
    if (nodo) nodo.scrollTop = nodo.scrollHeight;
  }, [entradas]);

  const ejecutar = async () => {
    const texto = linea.trim();
    if (!texto || ocupado) return;

    const esLocal = texto.startsWith("!");
    const id = (contador.current += 1);

    setEntradas((prev) => [
      ...prev,
      { id, line: texto, scope: esLocal ? "local" : "remote", running: true },
    ]);
    setHistorial((prev) => [...prev.filter((h) => h !== texto), texto]);
    setPosicion(-1);
    setLinea("");
    setOcupado(true);

    try {
      const salida = await execLine(sessionId, texto);
      setEntradas((prev) =>
        prev.map((e) => (e.id === id ? { ...e, running: false, output: salida } : e)),
      );
    } catch (err) {
      setEntradas((prev) =>
        prev.map((e) => (e.id === id ? { ...e, running: false, error: String(err) } : e)),
      );
    } finally {
      setOcupado(false);
      // El foco vuelve al campo para poder encadenar comandos.
      entradaRef.current?.focus();
    }
  };

  /** Flechas arriba/abajo para moverse por el historial. */
  const navegar = (delta: number) => {
    if (historial.length === 0) return;
    const siguiente = posicion + delta;

    if (siguiente < 0) {
      setPosicion(-1);
      setLinea("");
      return;
    }
    if (siguiente >= historial.length) return;

    setPosicion(siguiente);
    setLinea(historial[historial.length - 1 - siguiente]);
  };

  const esLocal = linea.trim().startsWith("!");

  return (
    <section
      className={cx(
        "flex shrink-0 flex-col border-t",
        compacto ? "border-[#3a3a3a] bg-[#1e1e1e]" : "border-border bg-bg/60",
      )}
    >
      <header
        className={cx(
          "flex items-center gap-1.5 border-b px-2",
          compacto ? "h-6 border-[#3a3a3a] text-[10px]" : "h-7 border-border text-[10px]",
        )}
      >
        <Terminal size={11} className="shrink-0 text-accent" />
        <span className="font-medium uppercase tracking-wider text-muted">
          {t("cmd.title")}
        </span>

        <span className="ml-1 truncate text-[9px] text-muted">
          {sessionId ? t("cmd.hintRemote") : t("cmd.hintLocalOnly")}
        </span>

        {entradas.length > 0 && (
          <button
            type="button"
            title={t("cmd.clear")}
            aria-label={t("cmd.clear")}
            onClick={() => setEntradas([])}
            className="ml-auto grid h-4 w-4 shrink-0 place-items-center rounded text-muted hover:text-danger"
          >
            <Trash2 size={10} />
          </button>
        )}
      </header>

      {entradas.length > 0 && (
        <div
          ref={salidaRef}
          className={cx(
            "overflow-y-auto px-2 py-1 font-mono",
            compacto ? "max-h-32 bg-[#1e1e1e] text-[10px]" : "max-h-40 bg-bg/40 text-[10px]",
          )}
        >
          {entradas.map((entrada) => (
            <div key={entrada.id} className="pb-1">
              <div className="flex items-baseline gap-1">
                <span className={entrada.scope === "local" ? "text-warning" : "text-accent"}>
                  {entrada.scope === "local" ? "!" : "❯"}
                </span>
                <span className="min-w-0 flex-1 break-all text-text">
                  {sinPrefijo(entrada.line)}
                </span>
                {entrada.scope === "local" && (
                  <span className="shrink-0 rounded bg-warning/15 px-1 text-[8px] text-warning">
                    {t("cmd.badgeLocal")}
                  </span>
                )}
              </div>

              {entrada.running && (
                <div className="flex items-center gap-1 pl-3 text-muted">
                  <Loader2 size={9} className="animate-spin" /> {t("cmd.running")}
                </div>
              )}

              {entrada.error && (
                <pre className="whitespace-pre-wrap break-all pl-3 text-danger">
                  {entrada.error}
                </pre>
              )}

              {entrada.output && (
                <>
                  {entrada.output.stdout && (
                    <pre className="whitespace-pre-wrap break-all pl-3 text-text/90">
                      {entrada.output.stdout.replace(/\n$/, "")}
                    </pre>
                  )}
                  {entrada.output.stderr && (
                    <pre className="whitespace-pre-wrap break-all pl-3 text-danger/90">
                      {entrada.output.stderr.replace(/\n$/, "")}
                    </pre>
                  )}

                  <div className="pl-3 text-[9px] text-muted">
                    {entrada.output.timedOut && (
                      <span className="text-warning">{t("cmd.timedOut")} · </span>
                    )}
                    {entrada.output.truncated && (
                      <span className="text-warning">{t("cmd.truncated")} · </span>
                    )}
                    {entrada.output.exitCode !== null && (
                      <span
                        className={
                          entrada.output.exitCode === 0 ? "text-success" : "text-danger"
                        }
                      >
                        {t("cmd.exitCode", { code: entrada.output.exitCode })}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1">
        <span
          className={cx(
            "shrink-0 select-none font-mono",
            esLocal ? "text-warning" : "text-accent",
            compacto ? "text-[11px]" : "text-[12px]",
          )}
          title={esLocal ? t("cmd.badgeLocal") : t("cmd.badgeRemote")}
        >
          {esLocal ? "!" : "❯"}
        </span>

        <input
          ref={entradaRef}
          value={linea}
          onChange={(e) => setLinea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void ejecutar();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              navegar(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              navegar(-1);
            }
          }}
          placeholder={sessionId ? t("cmd.placeholder") : t("cmd.placeholderLocal")}
          spellCheck={false}
          autoComplete="off"
          className={cx(
            "min-w-0 flex-1 bg-transparent font-mono text-text placeholder:text-muted focus:outline-none",
            compacto ? "text-[11px]" : "text-[12px]",
          )}
        />

        {ocupado ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-muted" />
        ) : (
          <button
            type="button"
            title={t("cmd.run")}
            aria-label={t("cmd.run")}
            onClick={() => void ejecutar()}
            disabled={!linea.trim()}
            className={cx(
              "grid h-5 w-5 shrink-0 place-items-center rounded text-muted transition-colors hover:text-accent",
              !linea.trim() && "opacity-30",
            )}
          >
            <CornerDownLeft size={10} />
          </button>
        )}
      </div>
    </section>
  );
}

export default CommandLine;
