/**
 * Puente con la línea de comandos del gestor de archivos.
 *
 * Por defecto los comandos se ejecutan **en el servidor**, por la sesión SSH del
 * panel. Con el prefijo `!` se ejecutan **en el equipo local**, igual que hace
 * Midnight Commander.
 */

import { invoke } from "@tauri-apps/api/core";

/** Prefijo que cambia la ejecución al equipo local. */
export const PREFIJO_LOCAL = "!";

/** Dónde se ejecutó un comando. */
export type ExecScope = "remote" | "local";

export interface ExecOutput {
  stdout: string;
  stderr: string;
  /** Código de salida, si el sistema lo informó. */
  exitCode: number | null;
  /** Se agotó el tiempo de espera y se dejó de escuchar. */
  timedOut: boolean;
  /** La salida se recortó por ser demasiado larga. */
  truncated: boolean;
  scope: ExecScope;
}

/** ¿Esta línea se ejecutará en el equipo local? */
export function esComandoLocal(line: string): boolean {
  return line.trim().startsWith(PREFIJO_LOCAL);
}

/** Quita el prefijo `!` para poder enseñar el comando sin él. */
export function sinPrefijo(line: string): string {
  const recortada = line.trim();
  return recortada.startsWith(PREFIJO_LOCAL)
    ? recortada.slice(PREFIJO_LOCAL.length).trim()
    : recortada;
}

/**
 * Ejecuta una línea, decidiendo el destino por el prefijo.
 *
 * `sessionId` puede ir vacío para los comandos locales, pero un comando remoto
 * sin sesión da error: es mejor decirlo que ejecutarlo donde no toca.
 */
export function execLine(
  sessionId: string | null,
  line: string,
  timeoutMs?: number,
): Promise<ExecOutput> {
  return invoke<ExecOutput>("exec_linea", {
    sessionId,
    line,
    timeoutMs: timeoutMs ?? null,
  });
}

/** Ejecuta un comando en el servidor. */
export function sftpExec(
  sessionId: string,
  command: string,
  timeoutMs?: number,
): Promise<ExecOutput> {
  return invoke<ExecOutput>("sftp_exec", {
    sessionId,
    command,
    timeoutMs: timeoutMs ?? null,
  });
}

/** Ejecuta un comando en el equipo local. */
export function localExec(command: string, timeoutMs?: number): Promise<ExecOutput> {
  return invoke<ExecOutput>("local_exec", {
    command,
    timeoutMs: timeoutMs ?? null,
  });
}
