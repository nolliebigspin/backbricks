import { z } from 'zod';

/** Numeric hooks remain compatible; pending physical work prevents project finalization. */
export const moduleErasureResultSchema = z.union([
  z.number().int().nonnegative(),
  z.object({ count: z.number().int().nonnegative(), pendingUntil: z.date().optional() }).strict(),
]);
export type ModuleErasureResult = z.infer<typeof moduleErasureResultSchema>;
