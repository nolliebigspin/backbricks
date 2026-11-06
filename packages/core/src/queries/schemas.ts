import { z } from 'zod';

import { pageQuerySchema } from '../http/pagination.ts';
import { publishableKeyTokenSchema } from '../keys/protocol.ts';
import { moduleAvailabilitySchema } from '../modules/catalog.ts';
import { auditFiltersSchema } from '../platform/activity-fields.ts';
import { auditEntrySchema, projectSchema } from '../platform/models.ts';
import { activityMetadataSchema } from '../services/activity.ts';
import { metricNameSchema, usagePeriodSchema } from '../services/usage.ts';

export const auditQuerySchema = pageQuerySchema.extend(auditFiltersSchema.shape);
export const auditResponseSchema = auditEntrySchema
  .omit({ organizationId: true, ipHash: true, expiresAt: true })
  .extend({ createdAt: z.iso.datetime(), changes: activityMetadataSchema.nullable() });
export const auditPageSchema = z.object({
  data: z.array(auditResponseSchema),
  nextCursor: z.string().nullable(),
});
export const usageQuerySchema = z.object({ period: usagePeriodSchema.optional() }).strict();
/** Decimal strings preserve counters above JavaScript's safe integer range. */
export const usageResponseSchema = z.object({
  period: usagePeriodSchema,
  data: z.array(z.object({ metric: metricNameSchema, value: z.string().regex(/^\d+$/) })),
});
export const integrationResponseSchema = z
  .object({
    baseUrl: z.url().describe('API v1 base URL, ending in /v1.'),
    project: projectSchema.pick({ id: true, name: true, slug: true, allowedOrigins: true }),
    publicKey: publishableKeyTokenSchema.nullable(),
    modules: z.array(moduleAvailabilitySchema),
  })
  .strict();
