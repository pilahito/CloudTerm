// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Enlaces externos y datos de contacto de CloudTerm.
 *
 * Los dos enlaces de donativo están verificados y activos (comprobados el
 * 2026-09-13: Buy Me a Coffee responde 200 con la página del proyecto, y
 * PayPal.Me resuelve a `paypal.com/paypalme/pilahito`).
 */

export const LINKS = {
  /** Forma canónica, sin `www`, que es como la sirve Buy Me a Coffee. */
  buyMeACoffee: "https://buymeacoffee.com/pilahito",
  paypal: "https://paypal.me/pilahito",
  repository: "https://github.com/pilahito/cloudterm",
  issues: "https://github.com/pilahito/cloudterm/issues",
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
} as const;

export const CONTACT_EMAIL = "57416155+pilahito@users.noreply.github.com";

/**
 * Abre una URL en el navegador del sistema.
 *
 * Dentro de Tauri usa el plugin `shell` (permiso `shell:allow-open`); fuera de
 * Tauri (dev server en un navegador normal) cae a `window.open`.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Copia texto al portapapeles con un fallback silencioso. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
