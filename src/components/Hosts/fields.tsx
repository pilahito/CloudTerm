/**
 * Piezas compartidas por los formularios de hosts.
 *
 * Viven aparte para que el alta y las propiedades de un host se vean igual.
 */

/** Envoltorio de un campo con su etiqueta y una pista opcional. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

/** Clases comunes de los `input` de estos formularios. */
export const INPUT =
  "w-full rounded-md border border-border bg-bg/60 px-2 py-1.5 text-xs text-text placeholder:text-muted focus:border-accent/60 focus:outline-none";

/** Tope inferior del tiempo de espera, en milisegundos. */
const MIN_TIMEOUT_MS = 5_000;

/** Tope superior del tiempo de espera, en milisegundos. */
const MAX_TIMEOUT_MS = 600_000;

/** Convierte los segundos del formulario a milisegundos, con topes sanos. */
export function normalizeTimeoutMs(seconds: string): number {
  const parsed = Number(seconds.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 60_000;
  return Math.min(Math.max(Math.round(parsed * 1000), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}
