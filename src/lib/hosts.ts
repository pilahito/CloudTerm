/**
 * Puente con la base de datos SQLite del backend (`sqlx`).
 *
 * Los hosts se guardan en `~/.local/share/com.pilahito.cloudterm/cloudterm.db`
 * (más la ruta que resuelva Tauri en cada sistema).
 */

import { invoke } from "@tauri-apps/api/core";
import type { AuthMethod, Connection, ConnectionProtocol } from "../types";

/** Datos necesarios para crear un host (sin id ni marcas de tiempo). */
export interface HostInput {
  name: string;
  host: string;
  port: number;
  username: string;
  protocol: ConnectionProtocol;
  group: string;
  authMethod: AuthMethod;
  privateKeyPath: string;
  useAgent: boolean;
  /** Presupuesto del handshake SSH en milisegundos (por defecto 60 000). */
  timeoutMs: number;
}

export interface SshConfigPreview {
  path: string;
  exists: boolean;
  entries: HostInput[];
  warnings: string[];
}

export function hostsList(): Promise<Connection[]> {
  return invoke<Connection[]>("hosts_list");
}

export function hostsCreate(input: HostInput): Promise<Connection> {
  return invoke<Connection>("hosts_create", { input });
}

export function hostsUpdate(host: Connection): Promise<Connection> {
  return invoke<Connection>("hosts_update", { host });
}

export function hostsDelete(id: string): Promise<void> {
  return invoke("hosts_delete", { id });
}

export function hostsTouch(id: string): Promise<void> {
  return invoke("hosts_touch", { id });
}

export function hostsImport(hosts: HostInput[]): Promise<Connection[]> {
  return invoke<Connection[]>("hosts_import", { hosts });
}

export function sshConfigPreview(): Promise<SshConfigPreview> {
  return invoke<SshConfigPreview>("ssh_config_preview");
}

export function dbLocation(): Promise<string> {
  return invoke<string>("db_location");
}
