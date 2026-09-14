// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Dónde se guarda la copia de seguridad.
 *
 * Además de GitHub y Google, se puede elegir una carpeta (que sirve para
 * cualquier nube con cliente de escritorio), un servidor WebDAV o tu propio
 * servidor por SSH.
 */

import { invoke } from "@tauri-apps/api/core";

export type Destino = "carpeta" | "webdav" | "sftp" | "github" | "google";

export interface Webdav {
  url: string;
  usuario: string;
  contrasena: string;
}

export interface Sftp {
  host: string;
  puerto: number;
  usuario: string;
  contrasena: string;
  ruta: string;
}

export interface ConfigDestinos {
  activo: Destino;
  carpeta: string;
  webdav: Webdav;
  sftp: Sftp;
}

/** Destinos en el orden en que se ofrecen. */
export const DESTINOS: Destino[] = ["carpeta", "webdav", "sftp", "github", "google"];

export function destinosEstado(): Promise<ConfigDestinos> {
  return invoke<ConfigDestinos>("destinos_estado");
}

export function destinosGuardar(config: ConfigDestinos): Promise<ConfigDestinos> {
  return invoke<ConfigDestinos>("destinos_guardar", { config });
}

/** Prueba el destino subiendo y leyendo una copia de prueba. */
export function destinosProbar(config: ConfigDestinos): Promise<string> {
  return invoke<string>("destinos_probar", { config });
}

export function destinosCarpetaSugerida(): Promise<string> {
  return invoke<string>("destinos_carpeta_sugerida");
}

/** Prepara la carpeta de la copia y devuelve la ruta. */
export function destinosAbrir(config: ConfigDestinos): Promise<string> {
  return invoke<string>("destinos_abrir", { config });
}
