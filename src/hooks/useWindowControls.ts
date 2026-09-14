import { useCallback, useEffect, useState } from "react";
import type { Window as TauriWindow } from "@tauri-apps/api/window";

/**
 * Controles de la ventana sin decoraciones nativas.
 *
 * Todas las llamadas degradan a un aviso por consola cuando la app corre en un
 * navegador normal (dev server sin el shell de Tauri).
 */
export function useWindowControls() {
  const [maximized, setMaximized] = useState(false);

  const run = useCallback(async (fn: (win: TauriWindow) => Promise<unknown>) => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await fn(getCurrentWindow());
    } catch (err) {
      console.warn("[CloudTerm] control de ventana no disponible:", err);
    }
  }, []);

  // Mantiene el icono de maximizar/restaurar en sincronía con la ventana real,
  // incluso si el usuario la maximiza con doble clic o desde el gestor de ventanas.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        setMaximized(await win.isMaximized());
        const stop = await win.onResized(() => {
          void win.isMaximized().then((value) => {
            if (!disposed) setMaximized(value);
          });
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch {
        /* fuera de Tauri */
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return {
    maximized,
    minimize: useCallback(() => run((w) => w.minimize()), [run]),
    toggleMaximize: useCallback(() => run((w) => w.toggleMaximize()), [run]),
    close: useCallback(() => run((w) => w.close()), [run]),
  };
}
