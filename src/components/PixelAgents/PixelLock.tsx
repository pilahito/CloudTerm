// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { Lock, Heart } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useT } from "../../i18n";

/**
 * Candado pixelado que cubre Pixel Agents mientras no se ha desbloqueado.
 *
 * Deliberadamente no revela cómo se consigue: la pista es el botón, no el texto.
 */
export function PixelLock() {
  const t = useT();
  const setDonateOpen = useUiStore((s) => s.setDonateOpen);

  // Bloques de 9 px. El candado se dibuja a mano para que combine con el
  // resto de la escena, que también es pixel-art de bloques.
  const block = (x: number, y: number, fill: string, key?: string) => (
    <rect key={key ?? `${x}-${y}`} x={x} y={y} width={9} height={9} fill={fill} />
  );

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <svg
          width="81"
          height="81"
          viewBox="0 0 81 81"
          shapeRendering="crispEdges"
          aria-hidden="true"
          className="drop-shadow-[0_0_22px_rgba(34,211,238,0.35)]"
        >
          {/* arco del candado */}
          {block(27, 9, "#22d3ee")}
          {block(36, 9, "#22d3ee")}
          {block(45, 9, "#22d3ee")}
          {block(18, 18, "#22d3ee")}
          {block(54, 18, "#22d3ee")}
          {block(18, 27, "#1f2a39")}
          {block(54, 27, "#1f2a39")}

          {/* cuerpo */}
          {[0, 1, 2, 3, 4, 5, 6].map((column) =>
            [0, 1, 2, 3].map((row) =>
              block(9 + column * 9, 36 + row * 9, row === 0 ? "#233246" : "#161f2b", `b-${column}-${row}`),
            ),
          )}

          {/* ojo de la cerradura */}
          {block(36, 45, "#0b1119")}
          {block(36, 54, "#0b1119")}
          {block(27, 45, "#0b1119")}
        </svg>

        <div className="flex items-center gap-2 text-muted">
          <Lock size={13} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            {t("pixel.locked")}
          </span>
        </div>

        <div>
          <h2 className="bg-gradient-to-b from-white via-accent to-accent/40 bg-clip-text text-2xl font-bold leading-tight text-transparent">
            {t("pixel.surpriseTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-[11px] leading-relaxed text-muted">
            {t("pixel.surpriseBody")}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDonateOpen(true)}
          className="flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-[#8b5cf6] px-4 py-2 text-xs font-medium text-white shadow-[0_0_24px_-6px_rgba(34,211,238,0.9)] transition-transform hover:scale-[1.03]"
        >
          <Heart size={13} />
          {t("donate.supportProject")}
        </button>

        <p className="text-[10px] text-muted/70">
          {t("pixel.alreadySupported")}
        </p>
      </div>
    </div>
  );
}

export default PixelLock;
