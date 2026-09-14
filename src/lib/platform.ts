/**
 * Detección de sistema operativo.
 *
 * CloudTerm se dibuja sin decoraciones nativas, así que necesita saber en qué
 * SO corre para colocar los controles de ventana donde el usuario los espera
 * (semáforos a la izquierda en macOS, botones a la derecha en Windows/Linux).
 */

import { t } from "../i18n";

export type OsName = "macos" | "windows" | "linux" | "other";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Heurística síncrona (User-Agent) válida para el primer render. */
export function guessOs(): OsName {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macos";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "other";
}

/**
 * Valor autoritativo del plugin `os` de Tauri.
 * `platform()` es síncrono (lee un objeto inyectado al arrancar), pero el
 * import del módulo no lo es.
 */
export async function detectOs(): Promise<OsName> {
  if (!isTauri()) return guessOs();
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    const value = platform();
    if (value === "macos" || value === "windows" || value === "linux") return value;
    return "other";
  } catch {
    return guessOs();
  }
}

/** Nombre legible para la pantalla «Acerca de». */
export const OS_LABEL: Record<OsName, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  // Se resuelve al leerlo, para que siga el idioma activo: un valor fijo se
  // evaluaría al importar el módulo y se quedaría con el idioma de arranque.
  get other(): string {
    return t("common.unknown");
  },
};
