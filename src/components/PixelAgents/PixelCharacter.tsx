// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { motion, useReducedMotion } from "motion/react";
import type { Connection } from "../../types";
import { hashHue } from "../../lib/utils";

interface PixelCharacterProps {
  host: Connection;
  /** El host responde al sondeo. */
  online: boolean;
  /** Hay una sesión SSH abierta contra este host. */
  active: boolean;
  /** La última latencia supera el umbral: se queja moviendo la cabeza. */
  laggy?: boolean;
  /** Retardo de entrada, para escalonar la aparición de varios agentes. */
  introDelay?: number;
}

/**
 * El personaje de un host, dibujado con rectángulos y animado con Motion.
 *
 * Todos los colores salen del nombre del host, así que un mismo servidor se ve
 * igual siempre y dos distintos nunca se confunden. Las animaciones usan solo
 * `transform` y `opacity` para que el webview no tenga que rehacer el layout.
 *
 * Con `prefers-reduced-motion` activo el personaje se queda quieto: la
 * información sigue estando en el chip y en el color de los auriculares.
 */
export function PixelCharacter({
  host,
  online,
  active,
  laggy = false,
  introDelay = 0,
}: PixelCharacterProps) {
  const reduce = useReducedMotion();

  const hue = hashHue(host.name || host.host);
  const hair = `hsl(${hue} 62% 52%)`;
  const shirt = `hsl(${(hue + 45) % 360} 48% 42%)`;
  const skin = "#e9b98d";
  const status = online ? "#28c878" : "#6b7c94";

  // Respiración lenta cuando está en línea; parpadeo del auricular siempre.
  const breathe = reduce
    ? {}
    : { scaleY: online ? [1, 1.03, 1] : 1 };
  const headsetPulse = reduce ? {} : { opacity: online ? [0.55, 1, 0.55] : 0.5 };

  // Tecleo: los brazos suben y bajan alternos.
  const typingLeft = reduce || !active ? {} : { y: [0, -2.4, 0] };
  const typingRight = reduce || !active ? {} : { y: [0, 2.4, 0] };

  // Cabeza: negación lenta cuando la latencia es alta.
  const headShake = reduce || !laggy ? {} : { x: [-4, 0, 0, 0] };

  return (
    <motion.g
      transform="translate(0 -14)"
      shapeRendering="crispEdges"
      style={{ transformBox: "fill-box", transformOrigin: "bottom", willChange: "transform" }}
      initial={reduce || introDelay === 0 ? false : { opacity: 0, x: -60 }}
      animate={{
        opacity: 1,
        x: 0,
        ...breathe,
      }}
      transition={{
        duration: reduce ? 0 : 0.5,
        delay: introDelay,
        x: { type: "spring", stiffness: 60, damping: 14, delay: introDelay },
        scaleY: { duration: 3, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      {/* brazos */}
      <motion.rect
        x={-14}
        y={-20}
        width={5}
        height={15}
        fill={shirt}
        animate={typingLeft}
        transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
      <motion.rect
        x={9}
        y={-20}
        width={5}
        height={15}
        fill={shirt}
        animate={typingRight}
        transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
      <motion.rect
        x={-15}
        y={-8}
        width={6}
        height={6}
        fill={skin}
        animate={typingLeft}
        transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
      <motion.rect
        x={9}
        y={-8}
        width={6}
        height={6}
        fill={skin}
        animate={typingRight}
        transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />

      {/* torso */}
      <rect x={-9} y={-22} width={18} height={22} fill={shirt} />
      <rect x={-9} y={-22} width={18} height={4} fill="#ffffff" opacity={0.13} />

      {/* cabeza, dentro de un grupo que puede negar con la lentitud */}
      <motion.g
        animate={headShake}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
      >
        <rect x={-7} y={-36} width={14} height={16} fill={skin} />
        <rect x={-9} y={-42} width={18} height={8} fill={hair} />
        <rect x={-10} y={-36} width={3} height={8} fill={hair} />
        <rect x={7} y={-36} width={3} height={8} fill={hair} />
        <rect x={-4} y={-30} width={3} height={3} fill="#1a2230" />
        <rect x={1} y={-30} width={3} height={3} fill="#1a2230" />
      </motion.g>

      {/* auriculares: el color y el pulso dicen si está en línea */}
      <motion.g
        animate={headsetPulse}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x={-10} y={-33} width={3} height={9} fill={status} opacity={0.9} />
        <rect x={7} y={-33} width={3} height={9} fill={status} opacity={0.9} />
      </motion.g>
    </motion.g>
  );
}

export default PixelCharacter;
