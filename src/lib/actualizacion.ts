// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Comprobación de actualizaciones contra las publicaciones de GitHub.
 *
 * No descarga ni instala nada: pregunta cuál es la última versión, la compara
 * con la que está en marcha y ofrece abrir la página de descarga.
 */

import { invoke } from "@tauri-apps/api/core";

export interface InfoActualizacion {
  actual: string;
  ultima: string | null;
  hayNueva: boolean;
  url: string | null;
  descarga: string | null;
  notas: string | null;
  publicada: string | null;
  /** Por qué no se pudo comprobar, si fue así. */
  aviso: string | null;
}

/** Pregunta a GitHub cuál es la última versión publicada. */
export function comprobarActualizacion(): Promise<InfoActualizacion> {
  return invoke<InfoActualizacion>("comprobar_actualizacion");
}

/** Repositorio del proyecto, para poder enseñarlo. */
export function repositorio(): Promise<string> {
  return invoke<string>("repositorio");
}
