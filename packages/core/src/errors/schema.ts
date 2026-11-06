import { z } from 'zod';

import { ERROR_CODES } from './codes.ts';

/** One invalid field or parameter in a validation problem; never include input values. */
export const fieldErrorSchema = z
  .object({
    path: z.string(),
    code: z.string(),
    message: z.string(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** RFC 9457 payload shared by server serialization and generated API documentation. */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z
      .number()
      .int()
      .min(100)
      .max(599)
      .refine((status) => Object.values(ERROR_CODES).some((entry) => entry.status === status)),
    code: z
      .string()
      .refine((code) => Object.hasOwn(ERROR_CODES, code))
      .meta({ 'x-extensible-enum': Object.keys(ERROR_CODES) }),
    detail: z.string().optional(),
    errors: z.array(fieldErrorSchema).optional(),
    hint: z.string().optional(),
    requestId: z.string(),
  })
  .strict();
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
