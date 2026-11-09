import { createHmac } from 'node:crypto';

import {
  AppError,
  POW_TTL_SECONDS,
  type CaptchaProvider,
  type Clock,
  type ReplayStore,
} from '@backbricks/core';
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';
import { z } from 'zod';

export const POW_COST = 1000;
export { POW_TTL_SECONDS } from '@backbricks/core';
const hex = (length: number) =>
  z
    .string()
    .length(length)
    .regex(/^[0-9a-f]+$/);
/** Public ALTCHA v2 allowlist; project binding is in the signing key, never public metadata. */
export const altchaChallengeSchema = z
  .object({
    parameters: z
      .object({
        algorithm: z.literal('SHA-256'),
        cost: z.literal(POW_COST),
        keyLength: z.literal(32),
        keyPrefix: z.literal('00'),
        nonce: hex(32),
        salt: hex(32),
        expiresAt: z.number().int().positive(),
      })
      .strict(),
    signature: hex(64),
  })
  .strict();
const payloadSchema = z
  .object({
    challenge: altchaChallengeSchema,
    solution: z
      .object({
        counter: z.number().int().min(0).max(0xffffffff),
        derivedKey: hex(64),
        time: z.number().nonnegative().max(600_000).optional(),
      })
      .strict(),
  })
  .strict();

/** Self-hosted PoW with purpose/project-separated signatures and atomic replay prevention. */
export function createAltchaProvider(deps: {
  appSecret: string;
  clock: Clock;
  replay: ReplayStore;
}): CaptchaProvider<z.infer<typeof altchaChallengeSchema>> {
  const projectSecret = (projectId: string) =>
    createHmac('sha256', deps.appSecret).update(`backbricks.pow.v1:${projectId}`).digest('hex');
  return {
    challengeSchema: altchaChallengeSchema,
    async create({ projectId, expiresAt }) {
      const now = deps.clock.now().getTime();
      if (expiresAt.getTime() <= now || expiresAt.getTime() > now + POW_TTL_SECONDS * 1000)
        throw new AppError('invalid_request', { detail: 'Invalid proof expiry.' });
      return altchaChallengeSchema.parse(
        await createChallenge({
          algorithm: 'SHA-256',
          cost: POW_COST,
          keyPrefix: '00',
          deriveKey,
          expiresAt,
          hmacSignatureSecret: projectSecret(projectId),
        }),
      );
    },
    async verify(input, { projectId, now }) {
      const parsed = payloadSchema.safeParse(input);
      if (!parsed.success) return false;
      const { challenge, solution } = parsed.data;
      if (
        challenge.parameters.expiresAt * 1000 <= now.getTime() ||
        challenge.parameters.expiresAt * 1000 > now.getTime() + POW_TTL_SECONDS * 1000
      )
        return false;
      const result = await verifySolution({
        challenge,
        solution,
        deriveKey,
        hmacSignatureSecret: projectSecret(projectId),
      });
      if (!result.verified) return false;
      return deps.replay.claim(
        challenge.signature,
        new Date(challenge.parameters.expiresAt * 1000),
      );
    },
  };
}
