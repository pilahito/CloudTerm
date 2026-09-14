import { useMemo } from "react";
import { motion } from "motion/react";

const COLORS = ["#22d3ee", "#28c878", "#facc15", "#c084fc", "#f472b6"];

/**
 * Confeti pixelado: cuadraditos que caen y se desvanecen.
 *
 * Se genera una sola vez con valores derivados del índice —no aleatorios por
 * render— para que no baile al volver a pintar.
 */
export function PixelConfetti({ pieces = 28 }: { pieces?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, index) => ({
        id: index,
        left: (index * 37) % 100,
        size: 5 + (index % 3) * 3,
        delay: (index % 10) * 0.06,
        duration: 1.4 + (index % 5) * 0.18,
        color: COLORS[index % COLORS.length],
        rotate: (index % 2 === 0 ? 1 : -1) * (90 + (index % 4) * 45),
      })),
    [pieces],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((item) => (
        <motion.span
          key={item.id}
          className="absolute top-0 block"
          style={{
            left: `${item.left}%`,
            width: item.size,
            height: item.size,
            backgroundColor: item.color,
            willChange: "transform, opacity",
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: "110%", opacity: [1, 1, 0], rotate: item.rotate }}
          transition={{ duration: item.duration, delay: item.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

export default PixelConfetti;
