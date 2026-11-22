import {
  AppError,
  assertPublicOrigin,
  DEFAULT_BODY_LIMIT_BYTES,
  publicRequestCredential,
  publishableKeyTokenSchema,
  type PublicCredentialResolver,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { IF_NONE_MATCH } from '../http/conditional-public-read.ts';

const ALLOWED_HEADERS = ['authorization', 'content-type', 'idempotency-key'];
/** Project-bound preflight uses a publishable query credential, since browsers omit bearer values on OPTIONS. */
export function publicPreflight(
  api: ApiRoutes,
  deps: {
    path: string;
    operationId: string;
    methods: readonly string[];
    conditionalRead?: boolean;
    resolve: PublicCredentialResolver;
    withTenant: WithTenant;
  },
) {
  api.register(
    createRoute({
      method: 'options',
      path: deps.path,
      operationId: deps.operationId,
      request: { query: z.object({ key: publishableKeyTokenSchema }).strict() },
      responses: { 204: { description: 'Permitted public request preflight.' } },
    }),
    { kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES },
    async (c) => {
      c.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      const origin = c.req.header('origin');
      const method = c.req.header('access-control-request-method')?.toUpperCase();
      const headers = (c.req.header('access-control-request-headers') ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const allowedHeaders =
        deps.conditionalRead && method === 'GET'
          ? [...ALLOWED_HEADERS, IF_NONE_MATCH]
          : ALLOWED_HEADERS;
      if (
        !origin ||
        !method ||
        !deps.methods.includes(method) ||
        headers.some((value) => !allowedHeaders.includes(value))
      )
        throw new AppError('forbidden');
      const identity = await deps.resolve(
        publicRequestCredential(c.req.raw.headers, c.req.valid('query').key),
        { origin, ipHash: c.get('ipHash'), requestId: c.get('requestId') },
      );
      if (!identity) throw new AppError('not_found');
      await deps.withTenant(
        { organizationId: identity.organizationId, projectId: identity.projectId },
        async (tx) => {
          const project = await tx.repositories.projects.get(identity.projectId);
          assertPublicOrigin(identity.kind, project.allowedOrigins, origin);
        },
      );
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Methods', deps.methods.join(', '));
      c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    },
  );
}
