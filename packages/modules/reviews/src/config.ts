import {
  publicWritePolicySchema,
  retentionDaysSchema,
  type PublicWritePolicyInput,
} from '@backbricks/core';
import { z } from 'zod';

import { REVIEW_LIMITS as limits } from './constants.ts';
import { reviewBodySchema, reviewTextSchema } from './submission-schema.ts';

const reservedFields = new Set([
  ...Object.keys(reviewBodySchema.shape).map((key) => key.toLowerCase()),
  'data',
  'proof',
  'honeypot',
  'altcha',
  'constructor',
  'prototype',
]);
const extraFieldSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(limits.fieldKeyLength)
      .regex(/^[a-z][a-z0-9_]*$/)
      .refine(
        (key) => !reservedFields.has(key),
        'Use a name distinct from built-in review fields.',
      ),
    label: reviewTextSchema.min(1).max(limits.fieldLabelLength),
    required: z.boolean().default(false),
    public: z.boolean().default(false),
  })
  .strict();

export const reviewsConfigSchema = z
  .object({
    ratingScale: z
      .number()
      .int()
      .min(limits.scaleMin)
      .max(limits.scaleMax)
      .default(limits.scaleDefault),
    moderation: z.literal('manual').default('manual'),
    titleRequired: z.boolean().default(false),
    bodyRequired: z.boolean().default(false),
    emailRequired: z.boolean().default(false),
    titleMaxLength: z.number().int().min(1).max(limits.titleLength).default(limits.titleLength),
    bodyMaxLength: z.number().int().min(1).max(limits.bodyLength).default(limits.bodyLength),
    authorDisplay: z
      .enum(['first_name_last_initial', 'initials'])
      .default('first_name_last_initial'),
    verificationMethod: reviewTextSchema.min(1).max(limits.verificationLength).optional(),
    fields: z.array(extraFieldSchema).max(limits.fieldCount).default([]),
    retentionDays: retentionDaysSchema,
    spam: z
      .object({
        proofOfWork: publicWritePolicySchema.shape.proofOfWork,
        honeypotField: publicWritePolicySchema.shape.honeypotField,
      })
      .strict()
      .prefault({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    const { honeypotField } = config.spam;
    if (reservedFields.has(honeypotField.toLowerCase()))
      ctx.addIssue({
        code: 'custom',
        path: ['spam', 'honeypotField'],
        message: 'Use a name distinct from built-in review fields.',
      });
    const seen = new Set<string>();
    for (const [index, field] of config.fields.entries()) {
      if (seen.has(field.key) || field.key === honeypotField)
        ctx.addIssue({
          code: 'custom',
          path: ['fields', index, 'key'],
          message: 'Review field names must be unique.',
        });
      seen.add(field.key);
    }
  });

export type ReviewsConfig = z.output<typeof reviewsConfigSchema>;

export function reviewsPublicWritePolicy(config: ReviewsConfig): PublicWritePolicyInput {
  return { ...config.spam, bodyLimitBytes: limits.bodyBytes };
}
