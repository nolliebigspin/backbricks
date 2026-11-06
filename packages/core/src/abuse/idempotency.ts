import { createHash, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { parseTypeId } from '../ids/type-id.ts';
import { canonicalJson, jsonValueSchema } from '../modules/values.ts';
import { activityNameSchema } from '../platform/activity-fields.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { expiresAfterDays } from '../time/retention.ts';

export const IDEMPOTENCY_RETENTION_DAYS = 1;
const MAX_REQUEST_DEPTH = 64;
const MAX_REQUEST_NODES = 100_000;
export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/);
export const idempotencyPolicySchema = z
  .object({ status: z.union([z.literal(200), z.literal(201), z.literal(202)]) })
  .strict();
/** Successful write caches hold acknowledgements and resource IDs, never arbitrary response content. */
export const idempotencyResponseSchema = z
  .object({
    accepted: z.literal(true).optional(),
    id: z
      .string()
      .refine((value) => parseTypeId(value) !== null)
      .optional(),
    status: activityNameSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

function fingerprint(input: unknown) {
  // Bound recursion before using shared canonicalization on untrusted JSON transport values.
  const stack = [{ value: input, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const next = stack.pop();
    if (!next) break;
    if (++nodes > MAX_REQUEST_NODES || next.depth > MAX_REQUEST_DEPTH)
      throw new AppError('validation_failed');
    if (next.value !== null && typeof next.value === 'object')
      for (const value of Object.values(next.value)) stack.push({ value, depth: next.depth + 1 });
  }
  const parsed = jsonValueSchema.safeParse(input);
  if (!parsed.success) throw new AppError('validation_failed');
  return createHash('sha256').update(canonicalJson(parsed.data)).digest();
}

/** Caller serializes read/save with the project's row lock; only committed successful responses exist. */
export function prepareIdempotentWrite(input: {
  key: string;
  request: unknown;
  status: 200 | 201 | 202;
  clock: Clock;
}) {
  const key = idempotencyKeySchema.safeParse(input.key);
  if (!key.success) throw new AppError('invalid_request');
  const storageKey = createHash('sha256').update(key.data).digest('hex');
  const requestHash = fingerprint(input.request);
  return {
    async replay(tx: TenantTransaction): Promise<Response | null> {
      const record = await tx.repositories.idempotency.get(storageKey, input.clock.now());
      if (!record) return null;
      if (
        record.requestHash.byteLength !== requestHash.byteLength ||
        !timingSafeEqual(record.requestHash, requestHash)
      )
        throw new AppError('conflict');
      const response = idempotencyResponseSchema.safeParse(record.responseBody);
      if (!response.success || record.responseStatus !== input.status)
        throw new AppError('internal_error');
      return Response.json(response.data, { status: input.status });
    },
    async save(tx: TenantTransaction, response: Response) {
      if (response.status !== input.status) throw new AppError('internal_error');
      const parsed = idempotencyResponseSchema.safeParse(await response.clone().json());
      if (!parsed.success)
        throw new AppError('internal_error', {
          detail: 'The response is not safe for idempotent replay.',
        });
      const now = input.clock.now();
      if (
        !(await tx.repositories.idempotency.insert({
          key: storageKey,
          requestHash,
          responseStatus: input.status,
          responseBody: parsed.data,
          createdAt: now,
          expiresAt: expiresAfterDays(now, IDEMPOTENCY_RETENTION_DAYS),
        }))
      )
        throw new AppError('conflict');
    },
  };
}
