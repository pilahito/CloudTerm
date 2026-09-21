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

/** `C:\…`, `C:/…` o UNC `\\servidor\recurso`. El SFTP remoto sigue siendo POSIX. */
export function isWindowsFsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function windowsSep(path: string): "\\" | "/" {
  return path.includes("/") && !path.includes("\\") ? "/" : "\\";
}

function joinOne(base: string, name: string): string {
  if (isWindowsFsPath(base)) {
    const sep = windowsSep(base);
    const trimmed = base.replace(/[\\/]+$/, "");
    return `${trimmed}${sep}${name}`;
  }
  if (!base || base === "/") return `/${name}`;
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

/** Une base y nombre. Acepta varios segmentos (`foo/bar`) y rutas Windows. */
export function joinPath(base: string, name: string): string {
  const parts = name.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return base;
  return parts.reduce((acc, part) => joinOne(acc, part), base);
}

export function sftpCancel(transferId: string): Promise<void> {
  return invoke("sftp_cancel", { transferId });
}

export interface WalkItem {
  /** Ruta absoluta en el origen. */
  sourcePath: string;
  /** Ruta relativa POSIX desde la raíz que se arrastró. */
  relativePath: string;
  isDir: boolean;
  size: number;
  name: string;
}

const MAX_WALK_DEPTH = 32;

async function walkEntries(
  root: FsEntry,
  list: (path: string) => Promise<FsEntry[]>,
): Promise<WalkItem[]> {
  const items: WalkItem[] = [];
  const visited = new Set<string>();

  const visit = async (entry: FsEntry, relativePath: string, depth: number) => {
    if (depth > MAX_WALK_DEPTH) return;
    const key = entry.path.toLowerCase();
    if (visited.has(key)) return;
    visited.add(key);

    items.push({
      sourcePath: entry.path,
      relativePath,
      isDir: entry.isDir,
      size: entry.size,
      name: entry.name,
    });

    if (!entry.isDir) return;
    const children = await list(entry.path);
    for (const child of children) {
      const childRel = relativePath ? `${relativePath}/${child.name}` : child.name;
      await visit(child, childRel, depth + 1);
    }
  };

  await visit(root, root.name, 0);
  return items;
}

export function walkLocalTree(root: FsEntry): Promise<WalkItem[]> {
  return walkEntries(root, localList);
}

export function walkRemoteTree(sessionId: string, root: FsEntry): Promise<WalkItem[]> {
  return walkEntries(root, (path) => sftpList(sessionId, path));
}

/**
 * Directorio padre.
 *
 * En Windows, el padre de `C:\` es `""` (la lista de unidades). En POSIX, el
 * padre de `/` es `/`.
 */
export function parentPath(path: string): string {
  if (!path) return "";
  if (isWindowsFsPath(path)) {
    const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "");
    if (/^[A-Za-z]:$/.test(normalized)) return "";
    if (normalized.startsWith("\\\\")) {
      const parts = normalized.split("\\").filter(Boolean);
      if (parts.length <= 2) return "";
      return `\\\\${parts.slice(0, -1).join("\\")}`;
    }
    const index = normalized.lastIndexOf("\\");
    if (index <= 2) return `${normalized.slice(0, 2)}\\`;
    return normalized.slice(0, index);
  }
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) return "/";
  return trimmed.slice(0, index);
}

/** Último segmento de una ruta, para mostrar migas de pan compactas. */
export function baseName(path: string): string {
  if (!path) return "";
  if (isWindowsFsPath(path)) {
    const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "");
    if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}\\`;
    const index = normalized.lastIndexOf("\\");
    return index === -1 ? normalized : normalized.slice(index + 1);
  }
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}
