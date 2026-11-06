import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { canonicalJson, jsonValueSchema } from '../modules/values.ts';

const claimsSchema = z
  .object({ expiresAt: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export function configDigest(input: unknown) {
  return createHash('sha256')
    .update(canonicalJson(jsonValueSchema.parse(input)))
    .digest('hex');
}
/** Signed digest only: plans carry no configuration, credentials or personal data. */
export function configPlanTokens(secret: string) {
  const key = createHmac('sha256', secret).update('backbricks.config-plan.v1').digest();
  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('hex');
  return {
    issue(digest: string, expiresAt: number) {
      const payload = Buffer.from(
        JSON.stringify(claimsSchema.parse({ digest, expiresAt })),
      ).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    verify(token: string, digest: string, now: number) {
      try {
        const [payload, signature, extra] = token.split('.');
        if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) throw new Error();
        if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(payload), 'hex')))
          throw new Error();
        const claims = claimsSchema.parse(
          JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        );
        if (claims.expiresAt <= now || claims.digest !== digest) throw new Error();
      } catch {
        throw new AppError('conflict', {
          detail: 'The plan is invalid, expired or stale. Create a new plan.',
        });
      }
    },
  };
}
