import { z } from 'zod';

/** Domain-record retention; audit and transient security records have their own fixed lifecycles. */
export const MODULE_RETENTION_DAYS = { min: 7, max: 3650, default: 180 } as const;
/** Omission selects the default; only an explicit null opts out of record expiry. */
export const retentionDaysSchema = z
  .number()
  .int()
  .min(MODULE_RETENTION_DAYS.min)
  .max(MODULE_RETENTION_DAYS.max)
  .nullable()
  .default(MODULE_RETENTION_DAYS.default);

/** Retention arithmetic uses an injected timestamp, never ambient wall-clock time. */
export const MILLISECONDS_PER_DAY = 86_400_000;

export function expiresAfterDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * MILLISECONDS_PER_DAY);
}
