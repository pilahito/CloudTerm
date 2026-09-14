// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Idiomas instalados por el usuario.
 *
 * Un fichero de idioma es código que acaba pintándose en la interfaz, y puede
 * no haberlo escrito el autor de CloudTerm. Por eso cada uno viene con **quién
 * lo firma**, y la aplicación avisa antes de usarlo.
 */

import { invoke } from "@tauri-apps/api/core";

export interface IdiomaExterno {
  id: string;
  nombre: string;
  autor: string;
  oficial: boolean;
  claves: number;
  ruta: string;
  /** Algo va mal con este fichero, o no lo firma el autor del proyecto. */
  aviso: string | null;
  diccionario: Record<string, string>;
}

/** Idiomas instalados en la carpeta de configuración. */
export function idiomasExternos(): Promise<IdiomaExterno[]> {
  return invoke<IdiomaExterno[]>("idiomas_externos");
}

/** Ruta de la carpeta de idiomas, para poder abrirla. */
export function carpetaIdiomas(): Promise<string> {
  return invoke<string>("idiomas_carpeta");
}
