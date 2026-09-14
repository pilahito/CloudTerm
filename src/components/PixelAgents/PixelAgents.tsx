// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Users, Plus, FileDown } from "lucide-react";
import { useConnectionStore, type HostProbe } from "../../stores/connectionStore";
import { useUiStore } from "../../stores/uiStore";
import { useTabStore } from "../../stores/tabStore";
import type { Connection } from "../../types";
import { PixelCharacter } from "./PixelCharacter";
import { PixelLock } from "./PixelLock";
import { PixelConfetti } from "./PixelConfetti";
import { useEasterEggStore } from "../../stores/easterEggStore";
import { useAgentActivity } from "../../hooks/useAgentActivity";
import { cx, formatLatency } from "../../lib/utils";
import { useT } from "../../i18n";

/* -------------------------------------------------------------------------- */
/* Geometría isométrica                                                       */
/* -------------------------------------------------------------------------- */

/** Media anchura y media altura de una baldosa. */
const HW = 30;
const HH = 15;
/** Separación entre puestos, en unidades de rejilla. */
const STEP = 2.4;

function iso(gx: number, gy: number, gz = 0): { x: number; y: number } {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH - gz };
}

/** Convierte una cara (lista de vértices 3D) en el atributo `points` de SVG. */
function face(points: Array<[number, number, number]>): string {
  return points
    .map(([x, y, z]) => {
      const projected = iso(x, y, z);
      return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
    })
    .join(" ");
}

/** Losa isométrica: cara superior + dos caras laterales. */
function Slab({
  gx,
  gy,
  w,
  d,
  h,
  top,
  side,
}: {
  gx: number;
  gy: number;
  w: number;
  d: number;
  h: number;
  top: string;
  side: string;
}) {
  const x0 = gx - w / 2;
  const x1 = gx + w / 2;
  const y0 = gy - d / 2;
  const y1 = gy + d / 2;

  return (
    <>
      {/* caras traseras primero, para que la oclusión salga bien */}
      <polygon points={face([[x0, y1, h], [x1, y1, h], [x1, y1, 0], [x0, y1, 0]])} fill={side} />
      <polygon
        points={face([[x1, y0, h], [x1, y1, h], [x1, y1, 0], [x1, y0, 0]])}
        fill={side}
        opacity={0.78}
      />
      <polygon
        points={face([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]])}
        fill={top}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Un agente                                                                  */
/* -------------------------------------------------------------------------- */

interface AgentProps {
  host: Connection;
  probe?: HostProbe;
  index: number;
  cols: number;
  /** Hay una sesión SSH viva contra este host. */
  active: boolean;
  /** Retardo de entrada, para escalonar la aparición. */
  introDelay: number;
  onOpen: (host: Connection) => void;
}

function Agent({ host, probe, index, cols, active, introDelay, onOpen }: AgentProps) {
  const t = useT();
  const gx = (index % cols) * STEP;
  const gy = Math.floor(index / cols) * STEP;
  const base = iso(gx, gy);

  const online = probe?.reachable === true;
  const offline = probe !== undefined && !probe.reachable;
  const statusColor = online ? "#28c878" : offline ? "#6b7c94" : "#facc15";
  const statusText = online
    ? formatLatency(probe?.latencyMs)
    : offline
      ? t("common.offline")
      : t("common.unchecked");

  const label = `${host.name} · ${statusText}`;
  const chipWidth = Math.max(78, label.length * 4.7 + 26);

  return (
    <g
      transform={`translate(${base.x.toFixed(1)} ${base.y.toFixed(1)})`}
      className="cursor-pointer"
      onClick={() => onOpen(host)}
    >
      <title>{`${host.username ? `${host.username}@` : ""}${host.host}:${host.port} — ${statusText}`}</title>

      {/* sombra en el suelo */}
      <ellipse cx={0} cy={4} rx={30} ry={12} fill="rgba(0,0,0,0.45)" />

      {/* silla */}
      <rect x={-12} y={-58} width={24} height={30} rx={4} fill="#1a2533" />
      <rect x={-12} y={-58} width={24} height={4} fill="#243347" />

      {/*
        Ojo: el grupo ya está trasladado al punto base, así que el escritorio y
        el monitor se dibujan en coordenadas LOCALES (0,0). Usar aquí `gx`/`gy`
        los desplazaría dos veces y los alejaría de su personaje.
      */}
      <Slab gx={0} gy={0} w={1.5} d={0.9} h={14} top="#233246" side="#161f2b" />

      {/* monitor: plano vertical mirando al observador */}
      <polygon
        points={face([
          [-0.6, -0.34, 16],
          [0.6, -0.34, 16],
          [0.6, -0.34, 36],
          [-0.6, -0.34, 36],
        ])}
        fill="#070c13"
        stroke={online ? "rgba(40,200,120,0.55)" : "rgba(58,74,94,0.6)"}
        strokeWidth={0.9}
      />
      {/* tres líneas de código en la pantalla */}
      <g opacity={online ? 0.9 : 0.4}>
        <polygon
          points={face([
            [-0.46, -0.34, 31.5],
            [0.22, -0.34, 31.5],
            [0.22, -0.34, 33.4],
            [-0.46, -0.34, 33.4],
          ])}
          fill="#22d3ee"
        />
        <polygon
          points={face([
            [-0.46, -0.34, 27],
            [0.4, -0.34, 27],
            [0.4, -0.34, 28.9],
            [-0.46, -0.34, 28.9],
          ])}
          fill="#28c878"
        />
        <polygon
          points={face([
            [-0.46, -0.34, 22.5],
            [0.02, -0.34, 22.5],
            [0.02, -0.34, 24.4],
            [-0.46, -0.34, 24.4],
          ])}
          fill="#f472b6"
        />
      </g>

      {/* personaje animado: respira, teclea si hay sesión y se queja si va lento */}
      <PixelCharacter
        host={host}
        online={online}
        active={active}
        laggy={(probe?.latencyMs ?? 0) > 100}
        introDelay={introDelay}
      />

      {/* chip con nombre y estado */}
      <g transform={`translate(${(-chipWidth / 2).toFixed(1)} -104)`}>
        <rect
          width={chipWidth}
          height={17}
          rx={8.5}
          fill="#0d121b"
          stroke={statusColor}
          strokeOpacity={online ? 0.55 : 0.35}
        />
        <circle cx={9.5} cy={8.5} r={3} fill={statusColor}>
          {online && <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />}
        </circle>
        <text
          x={17}
          y={12}
          fontSize={8.6}
          fill="#dbe7f5"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      </g>

      {/* área de clic generosa */}
      <rect x={-40} y={-112} width={80} height={130} fill="transparent" />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Escena                                                                     */
/* -------------------------------------------------------------------------- */

export function PixelAgents({
  compact = false,
  stagger = false,
}: {
  compact?: boolean;
  /** Escalona la entrada de los personajes (primera visita tras desbloquear). */
  stagger?: boolean;
}) {
  const t = useT();
  const hosts = useConnectionStore((s) => s.connections);
  const probes = useConnectionStore((s) => s.probes);
  const probing = useConnectionStore((s) => s.probing);
  const refreshStatuses = useConnectionStore((s) => s.refreshStatuses);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setNewHostOpen = useUiStore((s) => s.setNewHostOpen);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const openTab = useTabStore((s) => s.openTab);

  const cols = Math.max(1, Math.ceil(Math.sqrt(hosts.length || 1)));

  const viewBox = useMemo(() => {
    if (hosts.length === 0) return "-160 -140 320 240";
    const points = hosts.map((_, index) => {
      const gx = (index % cols) * STEP;
      const gy = Math.floor(index / cols) * STEP;
      return iso(gx, gy);
    });
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs) - 95;
    const maxX = Math.max(...xs) + 95;
    const minY = Math.min(...ys) - 135;
    const maxY = Math.max(...ys) + 60;
    return `${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}`;
  }, [hosts, cols]);

  const online = Object.values(probes).filter((probe) => probe.reachable).length;

  // Hosts con una sesión SSH viva: sus personajes se ponen a teclear.
  const activity = useAgentActivity();

  // Pixel Agents es un regalo para quien apoya el proyecto.
  const npcsUnlocked = useEasterEggStore((s) => s.npcsUnlocked);
  const introPlayed = useEasterEggStore((s) => s.introPlayed);
  const discreetMode = useEasterEggStore((s) => s.discreetMode);
  const markIntroPlayed = useEasterEggStore((s) => s.markIntroPlayed);
  const [playingIntro, setPlayingIntro] = useState(false);

  // La animación de entrada se reproduce una sola vez tras desbloquear.
  useEffect(() => {
    if (!npcsUnlocked || introPlayed || discreetMode || hosts.length === 0) return;
    setPlayingIntro(true);
    const timer = window.setTimeout(() => {
      setPlayingIntro(false);
      markIntroPlayed();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [npcsUnlocked, introPlayed, discreetMode, hosts.length, markIntroPlayed]);

  const openHost = (host: Connection) => {
    openTab({
      kind: host.protocol === "sftp" ? "sftp" : "terminal",
      connectionId: host.id,
      title: host.name,
    });
    setActiveView("terminal");
  };

  const gridLines = useMemo(() => {
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = [];
    const SPAN = 16;
    for (let i = -SPAN; i <= SPAN; i += 1) {
      const a = iso(i, -SPAN);
      const b = iso(i, SPAN);
      lines.push({ key: `u${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      const c = iso(-SPAN, i);
      const d = iso(SPAN, i);
      lines.push({ key: `v${i}`, x1: c.x, y1: c.y, x2: d.x, y2: d.y });
    }
    return lines;
  }, []);

  if (!npcsUnlocked) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PixelLock />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabecera (oculta cuando la escena va acoplada al panel lateral) */}
      {!compact && (
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Users size={13} className="text-accent" />
          <h2 className="text-xs font-semibold">Pixel Agents</h2>
          <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-muted">
            {hosts.length === 1 ? t("pixel.agentOne") : t("pixel.agentCount", { n: hosts.length })}
          </span>
          {online > 0 && (
            <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] text-success">
              {t("pixel.onlineCount", { n: online })}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNewHostOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text"
            >
              <Plus size={11} /> Host
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text"
            >
              <FileDown size={11} /> {t("pixel.import")}
            </button>
            <button
              type="button"
              onClick={() => void refreshStatuses()}
              disabled={probing || hosts.length === 0}
              title={t("pixel.checkTitle")}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-40"
            >
              <RefreshCw size={11} className={cx(probing && "animate-spin")} />
              {probing ? t("pixel.probing") : t("pixel.check")}
            </button>
          </div>
        </header>
      )}

      {/* Escena */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 22%, rgba(34,211,238,0.16), transparent 65%), radial-gradient(55% 45% at 72% 68%, rgba(139,92,246,0.14), transparent 70%), linear-gradient(180deg, #080d14 0%, #05080d 100%)",
        }}
      >
        {playingIntro && <PixelConfetti />}

        {hosts.length === 0 ? (
          <div className="grid h-full place-items-center px-6">
            <div className="flex max-w-xs flex-col items-center gap-3 text-center">
              <Users size={26} className="text-muted" />
              <p className="text-xs leading-relaxed text-muted">
                {t("pixel.empty")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewHostOpen(true)}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accentfg transition-opacity hover:opacity-90"
                >
                  <Plus size={12} /> {t("pixel.addHost")}
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
                >
                  <FileDown size={12} /> {t("pixel.import")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <svg
            className="h-full w-full"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={t("pixel.sceneLabel", { n: hosts.length })}
          >
            {/* suelo de rejilla isométrica */}
            <g stroke="rgba(34,211,238,0.09)" strokeWidth={0.7}>
              {gridLines.map((line) => (
                <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              ))}
            </g>

            {/* nubes decorativas */}
            <g fill="rgba(34,211,238,0.06)">
              <ellipse cx={-190} cy={-120} rx={52} ry={20} />
              <ellipse cx={-160} cy={-132} rx={34} ry={18} />
              <ellipse cx={210} cy={-150} rx={44} ry={17} />
              <ellipse cx={238} cy={-162} rx={28} ry={14} />
            </g>

            {/* agentes: de atrás hacia delante para que la oclusión sea correcta */}
            {hosts
              .map((host, index) => ({ host, index }))
              .sort((a, b) => {
                const ga = (a.index % cols) + Math.floor(a.index / cols);
                const gb = (b.index % cols) + Math.floor(b.index / cols);
                return ga - gb;
              })
              .map(({ host, index }) => (
                <Agent
                  key={host.id}
                  host={host}
                  probe={probes[host.id]}
                  index={index}
                  cols={cols}
                  active={activity.has(host.id)}
                  introDelay={(stagger || playingIntro) ? index * 0.1 : 0}
                  onOpen={openHost}
                />
              ))}
          </svg>
        )}
      </div>

      {!compact && hosts.length > 0 && (
        <p className="shrink-0 border-t border-border px-3 py-1 text-[10px] text-muted">
          {t("pixel.footerHint")}
        </p>
      )}
    </div>
  );
}

export default PixelAgents;
