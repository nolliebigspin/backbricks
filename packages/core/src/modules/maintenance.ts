import { z } from 'zod';

/** Report expired-record counts separately from deferred discovery work; numeric hooks remain compatible. */
export const moduleMaintenanceResultSchema = z.union([
  z.number().int().nonnegative(),
  z
    .object({
      count: z.number().int().nonnegative(),
      more: z.boolean(),
      notBefore: z.date().optional(),
    })
    .strict(),
]);
export type ModuleMaintenanceResult = z.infer<typeof moduleMaintenanceResultSchema>;
