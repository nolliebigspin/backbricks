import { z } from 'zod';

/** Shared inclusive UTC timestamp bounds; repositories combine them with their tenant scope. */
export const dateRangeQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from cannot be after to.',
    path: ['from'],
  });
