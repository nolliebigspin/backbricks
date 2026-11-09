import { z } from 'zod';

import type { FormsConfig } from './config.ts';
import { FORMS_LIMITS } from './constants.ts';

export const formKeyParams = z.object({ key: z.string().min(1).max(63) }).strict();
const option = z.object({ value: z.string(), label: z.string() }).strict();
/** Exactly what a website may learn about a form (I5); nothing about retention, redirects or people. */
export const publicFormFieldSchema = z
  .object({
    key: z.string(),
    type: z.string(),
    label: z.string(),
    help: z.string().optional(),
    required: z.boolean(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.union([z.number(), z.string()]).optional(),
    max: z.union([z.number(), z.string()]).optional(),
    options: z.array(option).optional(),
    maxFiles: z.number().optional(),
    consent: z.object({ text: z.string(), version: z.string() }).strict().optional(),
  })
  .strict();
export const publicFormSchema = z
  .object({
    key: z.string(),
    fields: z.array(publicFormFieldSchema),
    proofOfWork: z.boolean(),
    honeypotField: z.string(),
  })
  .strict();
export const submissionAcceptedSchema = z.object({ id: z.string() }).strict();

/** Projection of a form config onto its public schema; an allowlist, never a copy. */
export function publicForm(key: string, config: FormsConfig): z.infer<typeof publicFormSchema> {
  return publicFormSchema.parse({
    key,
    proofOfWork: config.spam.proofOfWork,
    honeypotField: config.spam.honeypotField,
    fields: config.fields.map((field) => {
      const base = {
        key: field.key,
        type: field.type,
        label: field.label,
        ...(field.help ? { help: field.help } : {}),
        required: field.required,
      };
      switch (field.type) {
        case 'text':
        case 'textarea':
          return { ...base, minLength: field.minLength, maxLength: field.maxLength };
        case 'url':
        case 'hidden':
          return { ...base, maxLength: field.maxLength };
        case 'number':
        case 'date':
          return { ...base, min: field.min, max: field.max };
        case 'select':
          return { ...base, options: field.options };
        case 'multiselect':
          return { ...base, options: field.options, min: field.min, max: field.max };
        case 'consent':
          return { ...base, consent: { text: field.text, version: field.version } };
        case 'file':
          return { ...base, maxFiles: field.maxFiles };
        default:
          return base;
      }
    }),
  });
}

// The domain schema depends on the form version, so the route body stays a bounded map and the
// handler validates against the instance config the guard loaded (ADR-0046 addendum).
export const submissionBodySchema = z
  .record(z.string().max(128), z.unknown())
  .refine((value) => Object.keys(value).length <= FORMS_LIMITS.fields + 10, {
    message: 'Too many fields.',
  });
