// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { Terminal, FileDown, Plus, Users, Sparkles, UserRound } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useTabStore } from "../../stores/tabStore";
import { useAuthStore } from "../../stores/authStore";
import { usePlatform } from "../../hooks/usePlatform";
import { useT } from "../../i18n";

/** Nube pixel-art dibujada con bloques, como en la referencia. */
function PixelCloud({
  x,
  y,
  scale = 1,
  opacity = 0.1,
}: {
  x: number;
  y: number;
  scale?: number;
  opacity?: number;
}) {
  const ROWS: Array<[number, number]> = [
    [2, 0],
    [3, 0],
    [4, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [6, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [7, 2],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [6, 3],
  ];

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} fill="currentColor">
      {ROWS.map(([bx, by]) => (
        <rect key={`${bx}-${by}`} x={bx * 10} y={by * 10} width={10} height={10} />
      ))}
    </g>
  );
}

interface ActionProps {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}

function Action({ icon, title, detail, onClick }: ActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface/70 p-3 text-left backdrop-blur transition-all hover:border-accent/60 hover:bg-elevated"
    >
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-accentfg">
        {icon}
      </span>
      <span className="text-xs font-medium text-text">{title}</span>
      <span className="text-[10px] leading-relaxed text-muted">{detail}</span>
    </button>
  );
}

export function WelcomeScreen() {
  const t = useT();
  const { modKey, modJoin } = usePlatform();
  const openTab = useTabStore((s) => s.openTab);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const setNewHostOpen = useUiStore((s) => s.setNewHostOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setRightPanel = useUiStore((s) => s.setRightPanel);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const account = useAuthStore((s) => s.account);

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-x-hidden overflow-y-auto">
      {/* Fondo: rejilla en perspectiva + nubes pixel-art */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] text-accent"
        style={{
          transform: "perspective(420px) rotateX(62deg)",
          transformOrigin: "bottom",
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.16) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to top, black, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to top, black, transparent 85%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 12%, rgba(34,211,238,0.14), transparent 70%)",
        }}
      />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-accent"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 800 500"
        aria-hidden="true"
      >
        <PixelCloud x={70} y={90} scale={1.4} opacity={0.09} />
        <PixelCloud x={560} y={60} scale={1.1} opacity={0.07} />
        <PixelCloud x={300} y={30} scale={0.8} opacity={0.05} />
        <PixelCloud x={640} y={210} scale={0.9} opacity={0.06} />
        <PixelCloud x={40} y={260} scale={0.7} opacity={0.05} />
      </svg>

      {/* Contenido */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-10">
        <div className="text-center">
          <h1 className="bg-gradient-to-b from-white via-accent to-accent/40 bg-clip-text text-4xl font-bold leading-tight tracking-tight text-transparent">
            {t("welcome.heroTitleLine1")}
            <br />
            {t("welcome.heroTitleLine2")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted">
            {t("welcome.heroSubtitle")}
          </p>
        </div>

        {/* Atajo Ctrl+K */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-accent/50 bg-surface px-3 py-1.5 font-mono text-xs text-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.8)]">
              {modKey}
            </kbd>
            <span className="text-xs text-muted">+</span>
            <kbd className="rounded-md border border-accent/50 bg-surface px-3 py-1.5 font-mono text-xs text-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.8)]">
              K
            </kbd>
          </div>
          <p className="text-[10px] text-muted">
            {t("welcome.paletteHint", { mod: modKey, join: modJoin })}
          </p>
        </div>

        {/* Acciones rápidas */}
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <Action
            icon={<Terminal size={14} />}
            title={t("welcome.newTerminal")}
            detail={t("welcome.newTerminalDetail")}
            onClick={() => {
              openTab({ kind: "terminal" });
              setActiveView("terminal");
            }}
          />
          <Action
            icon={<FileDown size={14} />}
            title={t("welcome.importHosts")}
            detail={t("welcome.importHostsDetail")}
            onClick={() => setImportOpen(true)}
          />
          <Action
            icon={<Plus size={14} />}
            title={t("welcome.addHost")}
            detail={t("welcome.addHostDetail")}
            onClick={() => setNewHostOpen(true)}
          />
          <Action
            icon={<Users size={14} />}
            title="Pixel Agents"
            detail={t("welcome.pixelAgentsDetail")}
            onClick={() => setActiveView("pixel")}
          />
        </div>

        <figure className="w-full max-w-xl">
          <video
            className="w-full rounded-lg border border-border bg-black shadow-[0_0_40px_-16px_rgba(34,211,238,0.45)]"
            src="/ejemplo.mp4"
            poster="/ejemplo-poster.png"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
          />
          <figcaption className="mt-2 text-center text-[10px] text-muted">
            {t("welcome.exampleVideoCaption")}
          </figcaption>
        </figure>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setRightPanel("ai");
              setPaletteOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text"
          >
            <Sparkles size={11} />
            {t("welcome.aiAssistant")}
          </button>

          {/* Solo se ofrece cuando no hay sesión: si ya la hay, sobra. */}
          {!account && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-accent/60 hover:text-text"
            >
              <UserRound size={11} />
              {t("welcome.signIn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WelcomeScreen;
