// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Enlaces `ssh://`.
 *
 * El instalador de Windows registra a CloudTerm como gestor de este esquema.
 * Al pulsar uno, el sistema arranca el programa con la dirección como
 * argumento y el backend la interpreta (`src-tauri/src/lanzamiento.rs`). Aquí
 * solo se pide y se tipa.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";

/** A dónde apunta el enlace con el que se abrió la aplicación. */
export interface DestinoLanzamiento {
  host: string;
  puerto: number;
  /** Cadena vacía si el enlace no traía usuario. */
  usuario: string;
  /** Cadena vacía si el enlace no traía ruta. */
  ruta: string;
}

/**
 * Destino del arranque, o `null` si se abrió a mano.
 *
 * Fuera de Tauri (servidor de desarrollo en el navegador) siempre es `null`:
 * no hay proceso del que leer argumentos.
 */
export async function lanzamientoInicial(): Promise<DestinoLanzamiento | null> {
  if (!isTauri()) return null;

  try {
    return await invoke<DestinoLanzamiento | null>("lanzamiento_inicial");
  } catch {
    // Un enlace mal formado no debe impedir abrir la aplicación.
    return null;
  }
}
