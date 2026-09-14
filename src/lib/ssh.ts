/**
 * Puente con el backend SSH de Rust.
 *
 * Todos los comandos viven en `src-tauri/src/ssh/mod.rs`; los eventos
 * (`ssh://data`, `ssh://status`) llegan por el bus de Tauri.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { t } from "../i18n";
import type { Connection, TabStatus } from "../types";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

/** Espejo de `SshAuth` en Rust (`#[serde(tag = "kind")]`). */
export type SshAuthSpec =
  | { kind: "password"; password: string }
  | { kind: "key"; keyPath: string | null; passphrase: string | null };

export interface SshConnectPayload {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  auth: SshAuthSpec;
  term: string;
  cols: number;
  rows: number;
  timeoutMs?: number;
}

export interface SshDataEvent {
  sessionId: string;
  data: number[];
}

export interface SshStatusEvent {
  sessionId: string;
  status: TabStatus;
  message: string | null;
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

export function sshConnect(payload: SshConnectPayload): Promise<unknown> {
  return invoke("ssh_connect", { request: payload });
}

export function sshWrite(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke("ssh_write", { sessionId, data: Array.from(data) });
}

export function sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke("ssh_resize", { sessionId, cols, rows });
}

export function sshDisconnect(sessionId: string): Promise<void> {
  return invoke("ssh_disconnect", { sessionId });
}

export function sshSessions(): Promise<string[]> {
  return invoke("ssh_sessions");
}

/* -------------------------------------------------------------------------- */
/* Sondeo de hosts                                                            */
/* -------------------------------------------------------------------------- */

export interface ProbeResult {
  host: string;
  port: number;
  reachable: boolean;
  latencyMs: number;
  banner: string | null;
  message: string;
}

/**
 * Comprueba si un host acepta conexiones TCP y cuánto tarda.
 * Es lo que alimenta las etiquetas «Online» y «18 ms» del árbol de hosts.
 */
export function probeHost(host: string, port: number, timeoutMs = 4000): Promise<ProbeResult> {
  return invoke<ProbeResult>("probe_host", { host, port, timeoutMs });
}

/* -------------------------------------------------------------------------- */
/* Eventos                                                                    */
/* -------------------------------------------------------------------------- */

export async function onSshData(
  handler: (payload: SshDataEvent) => void,
): Promise<UnlistenFn | null> {
  try {
    return await listen<SshDataEvent>("ssh://data", (event) => handler(event.payload));
  } catch {
    return null; // fuera de Tauri
  }
}

export async function onSshStatus(
  handler: (payload: SshStatusEvent) => void,
): Promise<UnlistenFn | null> {
  try {
    return await listen<SshStatusEvent>("ssh://status", (event) => handler(event.payload));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Secretos (llavero del sistema)                                             */
/* -------------------------------------------------------------------------- */

/** Clave con la que se guarda el secreto de una conexión en el llavero. */
export function secretKey(connection: Pick<Connection, "username" | "host" | "port">): string {
  return `ssh:${connection.username}@${connection.host}:${connection.port}`;
}

export async function loadSecret(key: string): Promise<string | null> {
  try {
    return await invoke<string | null>("secrets_get", { key });
  } catch {
    return null;
  }
}

export async function saveSecret(key: string, value: string): Promise<void> {
  try {
    await invoke("secrets_set", { key, value });
  } catch (err) {
    console.warn("[CloudTerm] no se pudo guardar el secreto:", err);
  }
}

export async function deleteSecret(key: string): Promise<void> {
  try {
    await invoke("secrets_delete", { key });
  } catch (err) {
    console.warn("[CloudTerm] no se pudo borrar el secreto:", err);
  }
}

/* -------------------------------------------------------------------------- */
/* Lógica de reconexión                                                       */
/* -------------------------------------------------------------------------- */

/**
 * ¿Merece la pena volver a pedir credenciales con este error?
 *
 * Un error de red o de host desconocido no se arregla escribiendo otra
 * contraseña, así que solo reintentamos con los fallos de autenticación.
 */
export function isCredentialError(message: string): boolean {
  return /credenciales rechazadas|KeyIsEncrypted|cifrad|passphrase|contraseña|no se pudo leer.*clave|no se encontró ninguna clave/i.test(
    message,
  );
}

/**
 * ¿Fue un corte por tiempo de espera durante el transporte?
 *
 * El host aceptó la conexión pero no llegó a completar el intercambio de claves.
 * Reintentar una vez tiene sentido porque suele ser algo transitorio.
 */
export function isHandshakeTimeout(message: string): boolean {
  return /tiempo de espera agotado al conectar/i.test(message);
}

/**
 * ¿Se agotó la espera **con la credencial ya enviada**?
 *
 * Es distinto del anterior: aquí el transporte fue bien y quien no contesta es
 * la autenticación. Reintentar no ayuda —cada intento volvería a esperar lo
 * mismo—, así que lo que toca es cambiar de método: con una clave SSH ese camino
 * del servidor no se toca.
 */
export function isAuthenticationTimeout(message: string): boolean {
  return /no contestó al inicio de sesión/i.test(message);
}

/** Texto legible para el usuario a partir del error del backend. */
export function describeSshError(message: string): string {
  if (/credenciales rechazadas/i.test(message)) return t("sshErrors.credentialsRejected");
  if (/KeyIsEncrypted|cifrad|passphrase/i.test(message)) return t("sshErrors.keyEncrypted");
  if (/no se encontró ninguna clave/i.test(message)) return t("sshErrors.noKey");
  if (/tiempo de espera agotado al conectar/i.test(message))
    return t("sshErrors.handshakeTimeout");
  if (isAuthenticationTimeout(message)) return t("sshErrors.authTimeout");
  if (/conexión rechazada|Connection refused/i.test(message))
    return t("sshErrors.connectionRefused");
  return message;
}
