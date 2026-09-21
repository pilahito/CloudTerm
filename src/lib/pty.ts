// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/**
 * Terminal local: PTY del sistema (ConPTY en Windows, pty en Unix).
 *
 * El contrato es el mismo que el SSH: bytes crudos y un evento de estado.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PtyOpenPayload {
  sessionId: string;
  cols: number;
  rows: number;
  cwd?: string;
}

export interface PtyDataEvent {
  sessionId: string;
  data: number[];
}

export interface PtyStatusEvent {
  sessionId: string;
  status: string;
  message: string | null;
}

export function ptyOpen(payload: PtyOpenPayload): Promise<void> {
  return invoke("pty_open", { request: payload });
}

export function ptyWrite(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke("pty_write", { sessionId, data: Array.from(data) });
}

export function ptyResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { sessionId, cols, rows });
}

export function ptyClose(sessionId: string): Promise<void> {
  return invoke("pty_close", { sessionId });
}

export async function onPtyData(
  handler: (payload: PtyDataEvent) => void,
): Promise<UnlistenFn | null> {
  try {
    return await listen<PtyDataEvent>("pty://data", (event) => handler(event.payload));
  } catch {
    return null;
  }
}

export async function onPtyStatus(
  handler: (payload: PtyStatusEvent) => void,
): Promise<UnlistenFn | null> {
  try {
    return await listen<PtyStatusEvent>("pty://status", (event) => handler(event.payload));
  } catch {
    return null;
  }
}
