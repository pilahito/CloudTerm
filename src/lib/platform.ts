// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Detección de sistema operativo.
 *
 * CloudTerm se dibuja sin decoraciones nativas, así que necesita saber en qué
 * SO corre para colocar los controles de ventana donde el usuario los espera
 * (semáforos a la izquierda en macOS, botones a la derecha en Windows/Linux).
 */

import { t } from "../i18n";

export type OsName = "macos" | "windows" | "linux" | "android" | "ios" | "other";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * ¿Es una plataforma táctil sin teclado físico?
 *
 * Se usa para no enseñar atajos de teclado donde no se pueden pulsar (Android,
 * iOS). En móvil el `Ctrl+K` del onboarding no tiene sentido: no hay teclado
 * con el que escribirlo.
 */
export function isMobileOs(os: OsName): boolean {
  return os === "android" || os === "ios";
}

/**
 * Heurística síncrona (User-Agent) válida para el primer render.
 *
 * Importa que reconozca Android aquí, y no solo en la versión asíncrona: el
 * primer render decide si se enseña el atajo de teclado, y si esto devolviera
 * «other» el móvil vería un `Ctrl+K` inútil durante un instante.
 */
export function guessOs(): OsName {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  // iPhone/iPad: iPadOS moderno se declara como Mac, así que también se mira el
  // número de puntos táctiles.
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
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
    if (
      value === "macos" ||
      value === "windows" ||
      value === "linux" ||
      value === "android" ||
      value === "ios"
    ) {
      return value;
    }
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
  android: "Android",
  ios: "iOS",
  // Se resuelve al leerlo, para que siga el idioma activo: un valor fijo se
  // evaluaría al importar el módulo y se quedaría con el idioma de arranque.
  get other(): string {
    return t("common.unknown");
  },
};
