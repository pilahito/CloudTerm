// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useState } from "react";
import { Package, HardDrive, Server } from "lucide-react";
import { useTransferStore } from "../../stores/transferStore";
import { useT } from "../../i18n";

/**
 * La oficina de transferencias.
 *
 * Es la versión con personajes de la cola de transferencias: mientras hay un
 * archivo moviéndose, un agente lo lleva de un escritorio al otro. Cuando no hay
 * nada en marcha, se queda esperando y lo dice.
 *
 * Se dibuja con rectángulos de bordes duros a propósito: es una escena de
 * píxeles, no un gráfico vectorial con curvas.
 */

/** Ancho del lienzo; las posiciones se calculan sobre estas unidades. */
const ANCHO = 220;
const ALTO = 108;
/** Altura del suelo. */
const SUELO = 88;
/** Posición de la caja del agente en cada extremo. */
const X_LOCAL = 38;
const X_REMOTO = 178;

/** Un fotograma de la animación de andar. */
function usePaso(activo: boolean): number {
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    if (!activo) {
      setPaso(0);
      return;
    }
    const timer = window.setInterval(() => setPaso((p) => (p + 1) % 2), 220);
    return () => window.clearInterval(timer);
  }, [activo]);

  return paso;
}

/** Personaje de píxeles que camina. */
function Agente({
  x,
  paso,
  cargando,
  mirandoDerecha,
}: {
  x: number;
  paso: number;
  cargando: boolean;
  mirandoDerecha: boolean;
}) {
  const camisa = "rgb(var(--ct-accent))";
  const piel = "#e9b98d";
  const pelo = "rgb(var(--ct-warning))";

  // Las piernas alternan para dar sensación de caminar.
  const piernaIzq = paso === 0 ? 0 : 2;
  const piernaDer = paso === 0 ? 2 : 0;

  return (
    <g
      transform={`translate(${x}, 0)`}
      style={{ transition: "transform 420ms linear" }}
    >
      {/* Archivo que lleva en alto */}
      {cargando && (
        <g transform={`translate(${mirandoDerecha ? 1 : -9}, ${SUELO - 38})`}>
          <rect width="12" height="10" fill="rgb(var(--ct-surface))" stroke="rgb(var(--ct-border))" />
          <rect x="2" y="2" width="8" height="6" fill="rgb(var(--ct-accent))" opacity="0.5" />
        </g>
      )}

      {/* Brazos */}
      <rect x="-5" y={SUELO - 24} width="3" height="9" fill={piel} />
      <rect x="6" y={SUELO - 24} width="3" height="9" fill={piel} />

      {/* Piernas */}
      <rect x="-3" y={SUELO - 10} width="3.5" height={10 - piernaIzq} fill="#3a4256" />
      <rect x="3" y={SUELO - 10} width="3.5" height={10 - piernaDer} fill="#3a4256" />

      {/* Torso */}
      <rect x="-4" y={SUELO - 26} width="12" height="17" rx="1" fill={camisa} />

      {/* Cabeza */}
      <rect x="-3" y={SUELO - 36} width="10" height="10" rx="1" fill={piel} />
      <rect x="-4" y={SUELO - 38} width="12" height="4" rx="1" fill={pelo} />

      {/* Ojos, mirando hacia donde camina */}
      <rect x={mirandoDerecha ? 4 : 0} y={SUELO - 32} width="1.6" height="1.6" fill="#1a1f2b" />
      <rect x={mirandoDerecha ? 6.4 : 2.4} y={SUELO - 32} width="1.6" height="1.6" fill="#1a1f2b" />
    </g>
  );
}

/** Escritorio con monitor. */
function EscritorioLocal() {
  return (
    <g>
      <rect x="8" y={SUELO - 22} width="42" height="4" fill="rgb(var(--ct-border))" />
      <rect x="12" y={SUELO - 18} width="3" height="18" fill="rgb(var(--ct-border))" />
      <rect x="43" y={SUELO - 18} width="3" height="18" fill="rgb(var(--ct-border))" />
      {/* Monitor */}
      <rect x="16" y={SUELO - 38} width="26" height="17" fill="rgb(var(--ct-surface))" stroke="rgb(var(--ct-border))" />
      <rect x="18" y={SUELO - 36} width="22" height="13" fill="rgb(var(--ct-accent))" opacity="0.22" />
      <rect x="27" y={SUELO - 21} width="4" height="3" fill="rgb(var(--ct-border))" />
    </g>
  );
}

/** Rack de servidores. */
function RackRemoto({ activo }: { activo: boolean }) {
  return (
    <g>
      <rect x="164" y={SUELO - 46} width="44" height="46" fill="rgb(var(--ct-surface))" stroke="rgb(var(--ct-border))" />
      {[0, 1, 2, 3].map((fila) => (
        <g key={fila}>
          <rect
            x="168"
            y={SUELO - 42 + fila * 11}
            width="36"
            height="8"
            fill="rgb(var(--ct-elevated))"
            stroke="rgb(var(--ct-border))"
          />
          <rect
            x="171"
            y={SUELO - 40 + fila * 11}
            width="3"
            height="3"
            fill={activo && fila % 2 === 0 ? "rgb(var(--ct-success))" : "rgb(var(--ct-muted))"}
          />
          <rect
            x="176"
            y={SUELO - 40 + fila * 11}
            width="3"
            height="3"
            fill={activo && fila % 2 === 1 ? "rgb(var(--ct-warning))" : "rgb(var(--ct-muted))"}
          />
        </g>
      ))}
    </g>
  );
}

export function PixelOffice() {
  const t = useT();
  const transfers = useTransferStore((s) => s.transfers);

  const activa = transfers.find((item) => item.status === "running");
  const enEspera = transfers.filter((item) => item.status === "queued").length;

  const movimiento = Boolean(activa);
  const paso = usePaso(movimiento);

  // Progreso de 0 a 1 para colocar al agente en el camino.
  const progreso = activa
    ? activa.size > 0
      ? Math.min(1, activa.transferred / activa.size)
      : 0.5
    : 0;

  const subiendo = activa?.direction !== "download";
  const desde = subiendo ? X_LOCAL : X_REMOTO;
  const hasta = subiendo ? X_REMOTO : X_LOCAL;
  const x = desde + (hasta - desde) * progreso;

  const porcentaje = activa
    ? activa.size > 0
      ? Math.round((activa.transferred / activa.size) * 100)
      : 0
    : 0;

  return (
    <section className="shrink-0 border-t border-border bg-bg/40">
      <header className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        <Package size={11} className="shrink-0 text-accent" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {t("office.title")}
        </span>

        <span className="ml-auto flex items-center gap-2 text-[9px] text-muted">
          {enEspera > 0 && <span>{t("office.queued", { count: enEspera })}</span>}
          {activa && (
            <span className="text-accent">
              {t("office.working", { percent: porcentaje })}
            </span>
          )}
        </span>
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="block h-[108px] w-full"
          shapeRendering="crispEdges"
          role="img"
          aria-label={t("office.title")}
        >
          {/* Suelo */}
          <rect x="0" y={SUELO} width={ANCHO} height="2" fill="rgb(var(--ct-border))" />

          {/* Camino entre los dos escritorios: se ilumina al transferir */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((marca) => (
            <rect
              key={marca}
              x={56 + marca * 13}
              y={SUELO + 5}
              width="8"
              height="2"
              fill="rgb(var(--ct-accent))"
              opacity={movimiento ? 0.55 : 0.16}
            />
          ))}

          <EscritorioLocal />
          <RackRemoto activo={movimiento} />

          {/* Etiquetas de los dos extremos */}
          <text x="29" y={SUELO + 20} textAnchor="middle" fontSize="7" fill="rgb(var(--ct-muted))">
            {t("common.local")}
          </text>
          <text x="186" y={SUELO + 20} textAnchor="middle" fontSize="7" fill="rgb(var(--ct-muted))">
            {t("common.remote")}
          </text>

          {/* Barra de progreso encima del camino */}
          {activa && (
            <rect
              x="56"
              y={SUELO + 12}
              width={Math.max(2, 104 * progreso)}
              height="3"
              fill="rgb(var(--ct-accent))"
            />
          )}

          <Agente x={x} paso={paso} cargando={movimiento} mirandoDerecha={subiendo} />
        </svg>

        {/* Sin nada en marcha, se dice en vez de dejar la escena muda */}
        {!movimiento && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-center gap-1.5 text-[9px] text-muted">
            <HardDrive size={9} />
            {transfers.length === 0 ? t("office.idle") : t("office.waiting")}
            <Server size={9} />
          </div>
        )}
      </div>
    </section>
  );
}

export default PixelOffice;
