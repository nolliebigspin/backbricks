import {
  AppError,
  instanceKeySchema,
  publicWritePolicySchema,
  type PublicWritePolicyInput,
} from '@backbricks/core';
import { z } from 'zod';

import {
  FORMS_BODY_LIMIT_BYTES,
  FORMS_DEFAULTS,
  FORMS_LIMITS,
  FORMS_RETENTION_DAYS,
} from './constants.ts';

// Field keys are API surface for websites and CSV columns, so they are stable and simple.
export const fieldKeySchema = z
  .string()
  .min(1)
  .max(FORMS_LIMITS.fieldKeyLength)
  .regex(/^[a-z][a-z0-9_]*$/);
const labelSchema = z.string().min(1).max(FORMS_LIMITS.labelLength);
const length = (max: number) => z.number().int().min(0).max(max);
const optionSchema = z
  .object({
    value: z
      .string()
      .min(1)
      .max(FORMS_LIMITS.optionValueLength)
      .regex(/^[a-z0-9_-]+$/),
    label: labelSchema,
  })
  .strict();
const optionsSchema = z.array(optionSchema).min(1).max(FORMS_LIMITS.options);
const base = {
  key: fieldKeySchema,
  label: labelSchema,
  help: z.string().min(1).max(FORMS_LIMITS.helpLength).optional(),
  required: z.boolean().default(false),
};
const field = <const T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ ...base, type: z.literal(type), ...shape }).strict();

export const formFieldSchema = z.discriminatedUnion('type', [
  field('text', {
    minLength: length(FORMS_LIMITS.textMaxLength).optional(),
    maxLength: length(FORMS_LIMITS.textMaxLength).min(1).default(FORMS_DEFAULTS.textMaxLength),
  }),
  field('textarea', {
    minLength: length(FORMS_LIMITS.textareaMaxLength).optional(),
    maxLength: length(FORMS_LIMITS.textareaMaxLength)
      .min(1)
      .default(FORMS_DEFAULTS.textareaMaxLength),
  }),
  field('email', { identifiesSubject: z.boolean().default(false) }),
  field('phone', {}),
  field('number', { min: z.number().optional(), max: z.number().optional() }),
  field('url', {
    maxLength: length(FORMS_LIMITS.urlMaxLength).min(1).default(FORMS_LIMITS.urlMaxLength),
  }),
  field('select', { options: optionsSchema }),
  field('multiselect', {
    options: optionsSchema,
    min: length(FORMS_LIMITS.options).optional(),
    max: length(FORMS_LIMITS.options).min(1).optional(),
  }),
  field('checkbox', {}),
  field('date', { min: z.iso.date().optional(), max: z.iso.date().optional() }),
  field('hidden', {
    maxLength: length(FORMS_LIMITS.hiddenMaxLength).min(1).default(FORMS_DEFAULTS.hiddenMaxLength),
  }),
  field('consent', {
    required: z.literal(true).default(true),
    text: z.string().min(1).max(FORMS_LIMITS.consentTextLength),
    version: z.string().min(1).max(FORMS_LIMITS.consentVersionLength),
  }),
  field('file', {
    zone: instanceKeySchema,
    maxFiles: z.number().int().min(1).max(FORMS_LIMITS.maxFilesPerField).default(1),
  }),
]);
export type FormField = z.output<typeof formFieldSchema>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Shape only; the submit path checks the origin against the project's current allowed origins (Q13). */
export const redirectUrlSchema = z
  .string()
  .max(FORMS_LIMITS.redirectUrlLength)
  .refine(
    (value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) &&
        !url.username &&
        !url.password &&
        !url.hash &&
        !url.hostname.includes('*')
      );
    },
    { message: 'Expected an absolute https URL without credentials or fragment.' },
  );

const honeypotField = publicWritePolicySchema.shape.honeypotField;
export const formsConfigSchema = z
  .object({
    fields: z.array(formFieldSchema).min(1).max(FORMS_LIMITS.fields),
    /** Values shown in the entries list; the list falls back to the first two visible fields. */
    listFields: z.array(fieldKeySchema).max(FORMS_LIMITS.listFields).optional(),
    spam: z
      .object({
        honeypotField,
        proofOfWork: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    limits: z
      .object({
        perMinute: z.number().int().min(1).max(FORMS_LIMITS.perMinute).optional(),
        perHour: z.number().int().min(1).max(FORMS_LIMITS.perHour).optional(),
      })
      .strict()
      .prefault({}),
    redirects: z
      .object({ success: redirectUrlSchema, error: redirectUrlSchema.optional() })
      .strict()
      .optional(),
    retentionDays: z
      .number()
      .int()
      .min(FORMS_RETENTION_DAYS.min)
      .max(FORMS_RETENTION_DAYS.max)
      .nullable()
      .default(FORMS_DEFAULTS.retentionDays),
  })
  .strict()
  .superRefine((config, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const keys = new Map<string, number>();
    let subjects = 0;
    config.fields.forEach((entry, index) => {
      const at = (name: string) => ['fields', index, name];
      if (keys.has(entry.key)) issue(at('key'), 'Field keys must be unique.');
      keys.set(entry.key, index);
      if (entry.key === config.spam.honeypotField)
        issue(at('key'), 'A field key cannot be the honeypot field name.');
      if (
        'minLength' in entry &&
        entry.minLength !== undefined &&
        entry.minLength > entry.maxLength
      )
        issue(at('minLength'), 'minLength cannot be greater than maxLength.');
      // ISO dates compare correctly as strings; numbers and option counts as numbers.
      const range =
        entry.type === 'number' || entry.type === 'multiselect'
          ? [entry.min, entry.max]
          : entry.type === 'date'
            ? [entry.min, entry.max]
            : [];
      const [min, max] = range;
      if (min !== undefined && max !== undefined && min > max)
        issue(at('min'), 'min cannot be greater than max.');
      if (entry.type === 'select' || entry.type === 'multiselect') {
        const values = entry.options.map((option) => option.value);
        if (new Set(values).size !== values.length)
          issue(at('options'), 'Option values must be unique.');
        if (entry.type === 'multiselect' && (entry.min ?? 0) > entry.options.length)
          issue(at('min'), 'min cannot exceed the number of options.');
      }
      if (entry.type === 'email' && entry.identifiesSubject) subjects += 1;
    });
    if (subjects > 1)
      issue(['fields'], 'At most one email field can identify the person (identifiesSubject).');
    const listed = new Set<string>();
    config.listFields?.forEach((key, index) => {
      if (!keys.has(key)) issue(['listFields', index], 'Unknown field key.');
      if (listed.has(key)) issue(['listFields', index], 'List fields must be unique.');
      listed.add(key);
    });
    if (new TextEncoder().encode(JSON.stringify(config)).byteLength > FORMS_LIMITS.configBytes)
      issue([], `The form configuration exceeds ${FORMS_LIMITS.configBytes} bytes.`);
  });
export type FormsConfig = z.output<typeof formsConfigSchema>;
export type FormsConfigInput = z.input<typeof formsConfigSchema>;

/** The default form is a contact form, so a new form is usable before the owner edits it. */
export function defaultFormsConfig(): FormsConfig {
  return formsConfigSchema.parse({
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true, maxLength: 200 },
      { key: 'email', type: 'email', label: 'Email', required: true, identifiesSubject: true },
      { key: 'message', type: 'textarea', label: 'Message', required: true },
    ],
  });
}

/** Maps the form's spam settings onto the shared public write guard (ADR-0046). */
export function formsPublicWritePolicy(config: FormsConfig): PublicWritePolicyInput {
  const perMinute =
    config.limits.perMinute ??
    (config.spam.proofOfWork ? undefined : FORMS_DEFAULTS.perMinuteWithoutProofOfWork);
  return {
    proofOfWork: config.spam.proofOfWork,
    honeypotField: config.spam.honeypotField,
    bodyLimitBytes: FORMS_BODY_LIMIT_BYTES,
    ...(perMinute === undefined ? {} : { perMinute }),
    ...(config.limits.perHour === undefined ? {} : { perHour: config.limits.perHour }),
  };
}

/** `file` fields need the optional `files` capability (uploads); without it the config is rejected (§C.7). */
export function assertFieldCapabilities(config: FormsConfig, available: { files: boolean }): void {
  if (available.files) return;
  const errors = config.fields.flatMap((entry, index) =>
    entry.type === 'file'
      ? [
          {
            path: `fields.${index}.type`,
            code: 'capability_unavailable',
            message: 'File fields need the uploads module.',
          },
        ]
      : [],
  );
  if (errors.length)
    throw new AppError('capability_unavailable', {
      detail: 'File fields need the uploads module, which is not enabled.',
      errors,
    });
}
