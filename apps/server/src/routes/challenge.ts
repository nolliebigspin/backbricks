import {
  DEFAULT_BODY_LIMIT_BYTES,
  publicRequestCredential,
  publishableKeyTokenSchema,
  type CaptchaProvider,
  type createChallengeService,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';

/** Public proof issuance validates credential/origin/rate boundaries before allocating work. */
export function challengeRoutes(
  api: ApiRoutes,
  deps: { captcha: CaptchaProvider; issue: ReturnType<typeof createChallengeService> },
) {
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/public/challenge',
      operationId: 'getPublicChallenge',
      request: { query: z.object({ key: publishableKeyTokenSchema.optional() }).strict() },
      responses: {
        200: {
          description: 'Signed, expiring project-bound proof challenge.',
          content: { 'application/json': { schema: deps.captcha.challengeSchema } },
        },
      },
    }),
    { kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES },
    async (c) => {
      c.header('Cache-Control', 'no-store');
      const credential = publicRequestCredential(c.req.raw.headers, c.req.valid('query').key);
      const challenge = await deps.issue(credential, {
        origin: c.req.header('origin') ?? null,
        ipHash: c.get('ipHash'),
        requestId: c.get('requestId'),
      });
      return c.json(challenge, 200);
    },
  );
}
