// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

/** Small helpers shared across CloudTerm components. */

import { t } from "../i18n";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function uid(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatRelativeTime(ts: number | null): string {
  if (!ts) return t("time.never");
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return t("time.justNow");
  if (min < 60) return t("time.minutesAgo", { count: min });
  const hours = Math.round(min / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t("time.daysAgo", { count: days });
}

export function defaultPort(protocol: string): number {
  switch (protocol) {
    case "ftp":
      return 21;
    case "ftps":
      return 990;
    default:
      return 22;
  }
}

/** Case-insensitive subsequence match used by the command palette. */
export function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = needle.toLowerCase().trim();
  if (!n) return true;
  const h = haystack.toLowerCase();
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i === n.length) return true;
  }
  return false;
}

/** Hash estable y barato de una cadena (FNV-1a de 32 bits). */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Tono (0-359) derivado del nombre. Da a cada host un color de avatar y un
 * personaje estables: el mismo host se ve igual siempre.
 */
export function hashHue(value: string): number {
  return hashString(value) % 360;
}

/** Iniciales para el avatar de un host: «prod-web-01» → «PW». */
export function initials(name: string): string {
  const words = name
    .split(/[\s._\-/]+/)
    .filter((word) => word.length > 0 && !/^\d+$/.test(word));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Latencia legible: «18 ms», «1.2 s». */
export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
