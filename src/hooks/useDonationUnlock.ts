// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect } from "react";
import { useEasterEggStore } from "../stores/easterEggStore";
import { useUiStore } from "../stores/uiStore";
import { t } from "../i18n";

/** Pasado este tiempo sin volver, se olvida que se hizo clic en donar. */
const FORGIVE_MS = 5 * 60 * 1000;

/**
 * Detecta la vuelta de una visita a la página de donativos.
 *
 * El clic en «Buy Me a Coffee» o «PayPal» abre el navegador del sistema y deja
 * la ventana sin foco. Si vuelve pasados unos segundos, se entiende que ha ido a
 * apoyar el proyecto y se desbloquea Pixel Agents.
 */
export function useDonationUnlock() {
  useEffect(() => {
    const onFocus = () => {
      const { donateClickTime, checkUnlock } = useEasterEggStore.getState();
      if (!donateClickTime) return;

      // Si ha pasado demasiado tiempo, el clic ya no cuenta: pudo ser cualquier
      // otra cosa y no queremos regalar el easter egg por una pausa larga.
      if (Date.now() - donateClickTime > FORGIVE_MS) {
        useEasterEggStore.setState({ donateClickTime: null });
        return;
      }

      if (checkUnlock()) {
        useUiStore
          .getState()
          .pushToast(
            "unlock",
            t("donation.unlockedTitle"),
            t("donation.unlockedBody"),
          );
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
}
