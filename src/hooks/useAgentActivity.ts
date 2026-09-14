// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useMemo } from "react";
import { useSshStore } from "../stores/sshStore";
import { useTabStore } from "../stores/tabStore";

/**
 * Qué hosts tienen una sesión SSH viva ahora mismo.
 *
 * El identificador de sesión SSH **es** el de la pestaña, así que basta con
 * cruzar las pestañas abiertas con el estado que publica el backend.
 *
 * Devuelve un `Set` de identificadores de conexión en lugar de una función para
 * que su identidad sea estable y no provoque renders en cascada.
 */
export function useAgentActivity(): Set<string> {
  const statuses = useSshStore((s) => s.status);
  const tabs = useTabStore((s) => s.tabs);

  return useMemo(() => {
    const active = new Set<string>();
    for (const tab of tabs) {
      if (tab.connectionId && statuses[tab.id] === "connected") {
        active.add(tab.connectionId);
      }
    }
    return active;
  }, [statuses, tabs]);
}
