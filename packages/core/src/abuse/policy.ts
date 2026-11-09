import { z } from 'zod';

import { DEFAULT_BODY_LIMIT_BYTES } from '../http/route-policy.ts';
import { scopeNameSchema } from '../keys/protocol.ts';
import { moduleInstanceSchema } from '../platform/models.ts';
import { metricNameSchema } from '../services/usage.ts';
import { idempotencyPolicySchema } from './idempotency.ts';
import { rateLimitInputSchema } from './rate-limiter.ts';

const field = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const publicAccessSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('read'), instanceParam: field.default('key') }).strict(),
  z
    .object({
      kind: z.literal('write'),
      instanceParam: field.default('key'),
      secretScope: scopeNameSchema,
      idempotency: idempotencyPolicySchema.optional(),
      quota: z
        .object({ metric: metricNameSchema, amountField: field.optional() })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type PublicAccess = z.output<typeof publicAccessSchema>;
export type PublicAccessInput = z.input<typeof publicAccessSchema>;
export const publicWritePolicySchema = z
  .object({
    proofOfWork: z.boolean().default(true),
    honeypotField: field.default('_gotcha'),
    bodyLimitBytes: z
      .number()
      .int()
      .positive()
      .max(DEFAULT_BODY_LIMIT_BYTES)
      .default(DEFAULT_BODY_LIMIT_BYTES),
    perMinute: rateLimitInputSchema.shape.limit.default(10),
    perHour: rateLimitInputSchema.shape.limit.default(100),
  })
  .strict();
export type PublicWritePolicy = z.output<typeof publicWritePolicySchema>;
export type PublicWritePolicyInput = z.input<typeof publicWritePolicySchema>;
export const spamVerdictSchema = z
  .object({
    status: z.enum(['clean', 'suspect', 'spam']),
    reasons: z.array(z.enum(['links', 'repetition'])),
  })
  .strict();
/** The active instance a public route runs against, with the config the guard already validated. */
export const publicReadContextSchema = z
  .object({
    instanceId: moduleInstanceSchema.shape.id,
    configVersion: moduleInstanceSchema.shape.configVersion,
    config: z.json(),
  })
  .strict();
export type PublicReadContext = z.infer<typeof publicReadContextSchema>;
/** Minimized request metadata a module may store (I11): no raw IP or user agent, no query string. */
export const publicRequestSourceSchema = z
  .object({
    origin: z.string().max(2048).nullable(),
    path: z.string().max(2048).nullable(),
    uaFamily: z.string().max(32),
    ipHash: z.string().max(128).nullable(),
  })
  .strict();
export type PublicRequestSource = z.infer<typeof publicRequestSourceSchema>;
export const publicWriteContextSchema = publicReadContextSchema
  .extend({ spam: spamVerdictSchema, source: publicRequestSourceSchema })
  .strict();
export type PublicWriteContext = z.infer<typeof publicWriteContextSchema>;
export const honeypotResponseSchema = z.object({ accepted: z.literal(true) }).strict();

/** JSON transport metadata stays outside the module's typed data payload. */
export const publicWriteEnvelopeSchema = (data: z.ZodType) =>
  z
    .object({ data, proof: z.unknown().optional(), honeypot: z.string().max(1024).optional() })
    .strict();

/** Fixed, bounded heuristics classify accepted data; callers must retain suspect/spam records. */
export function spamVerdict(input: unknown): z.infer<typeof spamVerdictSchema> {
  const pending: unknown[] = [input];
  let links = 0;
  let repetition = false;
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') {
      links += item.match(/https?:\/\//g)?.length ?? 0;
      repetition ||= /(.)\1{19}/s.test(item);
    } else if (Array.isArray(item)) {
      for (const value of item) pending.push(value);
    } else if (item !== null && typeof item === 'object') {
      for (const value of Object.values(item)) pending.push(value);
    }
  }
  return {
    status: links > 10 ? 'spam' : links > 3 || repetition ? 'suspect' : 'clean',
    reasons: [
      ...(links > 3 ? ['links' as const] : []),
      ...(repetition ? ['repetition' as const] : []),
    ],
  };
}
