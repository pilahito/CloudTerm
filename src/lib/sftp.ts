// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Puente con el backend SFTP y con el sistema de archivos local.
 *
 * El progreso de cada transferencia llega por el evento `sftp://progress`,
 * identificado por `transferId`.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Connection } from "../types";
import { secretKey, loadSecret, type SshAuthSpec } from "./ssh";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modified: number | null;
  permissions: string | null;
}

export interface SftpConnectInfo {
  sessionId: string;
  home: string;
  message: string;
}

export interface SftpProgressEvent {
  transferId: string;
  transferred: number;
  total: number;
  done: boolean;
}

export interface SftpConnectPayload {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  auth: SshAuthSpec;
  timeoutMs?: number;
}

/* -------------------------------------------------------------------------- */
/* Comandos                                                                   */
/* -------------------------------------------------------------------------- */

export function localHome(): Promise<string> {
  return invoke<string>("local_home");
}

export function localList(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("local_list", { path });
}

export function localMkdir(path: string): Promise<void> {
  return invoke("local_mkdir", { path });
}

export function sftpConnect(payload: SftpConnectPayload): Promise<SftpConnectInfo> {
  return invoke<SftpConnectInfo>("sftp_connect", { request: payload });
}

export function sftpDisconnect(sessionId: string): Promise<void> {
  return invoke("sftp_disconnect", { sessionId });
}

export function sftpList(sessionId: string, path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("sftp_list", { sessionId, path });
}

export function sftpMkdir(sessionId: string, path: string): Promise<void> {
  return invoke("sftp_mkdir", { sessionId, path });
}

export function sftpRemove(sessionId: string, path: string, isDir: boolean): Promise<void> {
  return invoke("sftp_remove", { sessionId, path, isDir });
}

export function sftpRename(sessionId: string, from: string, to: string): Promise<void> {
  return invoke("sftp_rename", { sessionId, from, to });
}

export function sftpUpload(
  sessionId: string,
  transferId: string,
  localPath: string,
  remotePath: string,
): Promise<number> {
  return invoke<number>("sftp_upload", { sessionId, transferId, localPath, remotePath });
}

export function sftpDownload(
  sessionId: string,
  transferId: string,
  remotePath: string,
  localPath: string,
): Promise<number> {
  return invoke<number>("sftp_download", { sessionId, transferId, remotePath, localPath });
}

export async function onSftpProgress(
  handler: (payload: SftpProgressEvent) => void,
): Promise<UnlistenFn | null> {
  try {
    return await listen<SftpProgressEvent>("sftp://progress", (event) => handler(event.payload));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Autenticación                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resuelve cómo autenticarse contra una conexión: lo que haya en el llavero o,
 * si no hay nada, el modal de credenciales.
 */
export async function resolveAuth(
  connection: Connection,
  sessionId: string,
  hint?: string,
): Promise<SshAuthSpec | null> {
  const stored = await loadSecret(secretKey(connection));

  if (connection.authMethod === "key") {
    return { kind: "key", keyPath: connection.privateKeyPath || null, passphrase: stored };
  }
  if (stored) {
    return { kind: "password", password: stored };
  }
  const { useSshStore } = await import("../stores/sshStore");
  return useSshStore.getState().requestCredentials(sessionId, connection, hint);
}

/* -------------------------------------------------------------------------- */
/* Rutas                                                                      */
/* -------------------------------------------------------------------------- */

/** Une base y nombre con `/`, válido también en Windows. */
export function joinPath(base: string, name: string): string {
  if (!base || base === "/") return `/${name}`;
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

/** Directorio padre, o la misma ruta si ya es la raíz. */
export function parentPath(path: string): string {
  if (!path || path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) return "/";
  return trimmed.slice(0, index);
}

/** Último segmento de una ruta, para mostrar migas de pan compactas. */
export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}
