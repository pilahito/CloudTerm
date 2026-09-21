// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Comprobación y descarga de actualizaciones contra GitHub Releases.
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

/** Baja el instalador de esta plataforma y lo abre. */
export function descargarEInstalar(url: string): Promise<string> {
  return invoke<string>("descargar_e_instalar", { url });
}
