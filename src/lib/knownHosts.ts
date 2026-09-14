/**
 * Puente con la verificación de claves de servidor (`known_hosts`).
 *
 * Cuando el backend encuentra un host desconocido —o uno cuya clave ha
 * cambiado— emite un evento y **deja el handshake SSH esperando**. La respuesta
 * viaja por `knownHostsDecide`.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface KnownHostEntry {
  host: string;
  port: number;
  keyType: string;
  key: string;
  fingerprint: string;
}

export interface HostKeyPrompt {
  requestId: string;
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
  /** Solo en los cambios de clave. */
  oldFingerprint: string | null;
}

export function knownHostsList(): Promise<KnownHostEntry[]> {
  return invoke<KnownHostEntry[]>("known_hosts_list");
}

export function knownHostsRemove(host: string, port: number): Promise<boolean> {
  return invoke<boolean>("known_hosts_remove", { host, port });
}

export function knownHostsClear(): Promise<void> {
  return invoke("known_hosts_clear");
}

export function knownHostsAdd(host: string, port: number, key: string): Promise<KnownHostEntry> {
  return invoke<KnownHostEntry>("known_hosts_add", { host, port, key });
}

export function knownHostsPath(): Promise<string> {
  return invoke<string>("known_hosts_path");
}

/** Responde a un aviso. Devuelve `false` si la conexión ya no lo esperaba. */
export function knownHostsDecide(
  requestId: string,
  accept: boolean,
  remember: boolean,
): Promise<boolean> {
  return invoke<boolean>("known_hosts_decide", { requestId, accept, remember });
}

/**
 * Escucha los dos avisos de clave.
 *
 * Devuelve una función para dejar de escuchar, o `null` fuera de Tauri.
 */
export async function onHostKeyPrompt(
  handler: (prompt: HostKeyPrompt) => void,
): Promise<UnlistenFn | null> {
  try {
    const stops = await Promise.all([
      listen<HostKeyPrompt>("ssh://host-key-new", (event) => handler(event.payload)),
      listen<HostKeyPrompt>("ssh://host-key-mismatch", (event) => handler(event.payload)),
    ]);
    return () => stops.forEach((stop) => stop());
  } catch {
    return null;
  }
}
