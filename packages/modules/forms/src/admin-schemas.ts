import {
  jsonValueWireSchema,
  pageQuerySchema,
  spamVerdictSchema,
  publicRequestSourceSchema,
} from '@backbricks/core';
import { z } from 'zod';

import { publicFormFieldSchema } from './public.ts';

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
export const submissionFiltersSchema = z
  .object({
    status: z.enum(['open', 'done']).optional(),
    read: booleanQuery.optional(),
    folder: z.enum(['inbox', 'spam']).default('inbox'),
    test: booleanQuery.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from cannot be after to.',
    path: ['from'],
  });
export const submissionsQuerySchema = submissionFiltersSchema.safeExtend(pageQuerySchema.shape);
export const submissionSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
    spam: z.number().int().nonnegative(),
  })
  .strict();
const values = z.record(z.string(), jsonValueWireSchema);
export const submissionItemSchema = z
  .object({
    id: z.string(),
    configVersion: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    status: z.enum(['open', 'done']),
    read: z.boolean(),
    spamVerdict: spamVerdictSchema.shape.status,
    isTest: z.boolean(),
    data: values,
  })
  .strict();
export const submissionListSchema = z
  .object({ data: z.array(submissionItemSchema), nextCursor: z.string().nullable() })
  .strict();
export const submissionDetailSchema = submissionItemSchema
  .extend({
    fields: z.array(publicFormFieldSchema),
    additionalData: values,
    source: z
      .object({
        origin: publicRequestSourceSchema.shape.origin.unwrap().optional(),
        path: publicRequestSourceSchema.shape.path.unwrap().optional(),
        uaFamily: publicRequestSourceSchema.shape.uaFamily,
        ipHash: publicRequestSourceSchema.shape.ipHash.unwrap().optional(),
      })
      .strict(),
    spamReasons: z.array(z.string()),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();
