/** Retention arithmetic uses an injected timestamp, never ambient wall-clock time. */
export const MILLISECONDS_PER_DAY = 86_400_000;

export function expiresAfterDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * MILLISECONDS_PER_DAY);
}
