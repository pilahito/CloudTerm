import { useEffect, useRef, useState } from "react";

/**
 * Fotogramas por segundo reales, medidos con `requestAnimationFrame`.
 *
 * Es lo que muestra la barra de estado: sirve para detectar de un vistazo si
 * una transferencia o una salida de terminal muy densa está ahogando el
 * renderizado del webview.
 */
export function useFps(sampleMs = 1000): number {
  const [fps, setFps] = useState(60);
  const frames = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    last.current = performance.now();

    const tick = () => {
      frames.current += 1;
      const now = performance.now();
      const elapsed = now - last.current;
      if (elapsed >= sampleMs) {
        setFps(Math.round((frames.current * 1000) / elapsed));
        frames.current = 0;
        last.current = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sampleMs]);

  return fps;
}
