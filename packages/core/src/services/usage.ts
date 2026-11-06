import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { API_KEY_PREFIXES } from '../keys/constants.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';

export const MAX_USAGE_VALUE = 9_223_372_036_854_775_807n;
export const metricNameSchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/)
  .refine((name) => !name.includes(API_KEY_PREFIXES.secret));
export const usagePeriodSchema = z.iso
  .date()
  .refine((period) => period.endsWith('-01') && !period.startsWith('0000-'), {
    message: 'Expected the first day of a UTC month.',
  });
export const usageIncrementSchema = z
  .object({ metric: metricNameSchema, delta: z.bigint().positive().max(MAX_USAGE_VALUE) })
  .strict();
export type UsageIncrement = z.infer<typeof usageIncrementSchema>;

/** The database stores monthly periods as the first calendar day, never a local-time boundary. */
export function monthlyUsagePeriod(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export interface UsageService {
  increment(tx: TenantTransaction, input: UsageIncrement): Promise<void>;
  list(tx: TenantTransaction, period?: string): Promise<{ metric: string; value: bigint }[]>;
}

/** Uses the caller's repositories so failed domain/audit/event writes also roll back usage. */
export function createUsageService(clock: Clock): UsageService {
  return {
    async increment(tx, input) {
      const result = usageIncrementSchema.safeParse(input);
      if (!result.success) throw new AppError('validation_failed');
      await tx.repositories.usage.increment(
        result.data.metric,
        monthlyUsagePeriod(clock.now()),
        result.data.delta,
      );
    },
    async list(tx, period = monthlyUsagePeriod(clock.now())) {
      const result = usagePeriodSchema.safeParse(period);
      if (!result.success) throw new AppError('validation_failed');
      return tx.repositories.usage.list(result.data);
    },
  };
}
