/** Small shared helpers with no application-domain knowledge. */

export function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Formats a coordinate for display, falling back to an em dash. */
export function formatCoordinate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(3);
}

/** Local wall-clock time with milliseconds, for console entries. */
export function formatTimestamp(date: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}`
  );
}

/**
 * Coerces unknown input into a finite number within range.
 * Used when reading persisted profiles and imported JSON.
 */
export function toFiniteNumber(
  value: unknown,
  fallback: number,
  min = -Infinity,
  max = Infinity,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

export function toTrimmedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
