import {
  publicWritePolicySchema,
  retentionDaysSchema,
  type PublicWritePolicyInput,
} from '@backbricks/core';
import { z } from 'zod';

import { UPLOAD_LIMITS } from './constants.ts';
import { uploadDeclarationSchema } from './declaration.ts';
import { UPLOAD_PRESETS, uploadPresetSchema } from './formats.ts';

/** Stable zone config; the composition-bound variant separately checks scanner availability. */
export const uploadsConfigSchema = z
  .object({
    presets: z
      .array(uploadPresetSchema)
      .min(1)
      .max(Object.keys(UPLOAD_PRESETS).length)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Choose each file preset only once.',
      }),
    maxSizeMb: z
      .number()
      .int()
      .min(1)
      .max(UPLOAD_LIMITS.maxSizeMb)
      .default(UPLOAD_LIMITS.defaultSizeMb),
    retentionDays: retentionDaysSchema,
    scanRequired: z.boolean().default(true),
    spam: z
      .object({ honeypotField: publicWritePolicySchema.shape.honeypotField })
      .strict()
      .prefault({}),
    limits: z
      .object({
        perMinute: publicWritePolicySchema.shape.perMinute.optional(),
        perHour: publicWritePolicySchema.shape.perHour.optional(),
      })
      .strict()
      .prefault({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (Object.hasOwn(uploadDeclarationSchema.shape, config.spam.honeypotField))
      ctx.addIssue({
        code: 'custom',
        path: ['spam', 'honeypotField'],
        message: 'The honeypot must not use a file declaration field name.',
      });
  });
export type UploadsConfig = z.output<typeof uploadsConfigSchema>;
export type UploadsConfigInput = z.input<typeof uploadsConfigSchema>;

/** Warnings apply on creation and later config changes, including an unchanged risky setting. */
export function uploadConfigWarnings(config: UploadsConfig): string[] {
  return [
    ...(!config.scanRequired ? ['Files may be accepted without malware scanning.'] : []),
    ...(config.retentionDays === null ? ['Files are kept without a time limit.'] : []),
  ];
}

/** Available infrastructure is supplied by composition, never read from env by the module. */
export function uploadsModuleConfigSchema(available: { scanner: boolean }) {
  return uploadsConfigSchema.superRefine((config, ctx) => {
    if (config.scanRequired && !available.scanner)
      ctx.addIssue({
        code: 'custom',
        path: ['scanRequired'],
        message: 'Malware scanning is required, but no scanner is configured.',
        params: { code: 'capability_unavailable' },
      });
  });
}

/** Upload intents always use proof-of-work; an unscanned zone does not disable abuse protection. */
export function uploadsPublicWritePolicy(config: UploadsConfig): PublicWritePolicyInput {
  return {
    proofOfWork: true,
    honeypotField: config.spam.honeypotField,
    bodyLimitBytes: UPLOAD_LIMITS.bodyBytes,
    ...(config.limits.perMinute === undefined ? {} : { perMinute: config.limits.perMinute }),
    ...(config.limits.perHour === undefined ? {} : { perHour: config.limits.perHour }),
  };
}
