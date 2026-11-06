import {
  DEFAULT_BODY_LIMIT_BYTES,
  publicRequestCredential,
  publishableKeyTokenSchema,
  type CaptchaProvider,
  type PublicCredentialResolver,
  type WithTenant,
  type createChallengeService,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { publicPreflight } from './public-cors.ts';

/** Public proof issuance validates credential/origin/rate boundaries before allocating work. */
export function challengeRoutes(
  api: ApiRoutes,
  deps: {
    captcha: CaptchaProvider;
    issue: ReturnType<typeof createChallengeService>;
    resolve: PublicCredentialResolver;
    withTenant: WithTenant;
  },
) {
  publicPreflight(api, {
    path: '/v1/public/challenge',
    operationId: 'public.challenge.preflight',
    methods: ['GET'],
    resolve: deps.resolve,
    withTenant: deps.withTenant,
  });
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
      c.header('Vary', 'Origin');
      const credential = publicRequestCredential(c.req.raw.headers, c.req.valid('query').key);
      const challenge = await deps.issue(
        credential,
        {
          origin: c.req.header('origin') ?? null,
          ipHash: c.get('ipHash'),
          requestId: c.get('requestId'),
        },
        (origin) => {
          c.header('Access-Control-Allow-Origin', origin);
          c.header('Vary', 'Origin');
        },
      );
      return c.json(challenge, 200);
    },
  );
}
