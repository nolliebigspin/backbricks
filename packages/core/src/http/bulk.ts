import { z } from 'zod';

export const MAX_BULK_ITEMS = 100;
/** All-or-nothing write batches share one ceiling and reject duplicate identifiers. */
export const bulkIdsSchema = z
  .array(z.string().min(1).max(128))
  .min(1)
  .max(MAX_BULK_ITEMS)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Use distinct identifiers.' });
