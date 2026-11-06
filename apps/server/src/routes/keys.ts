import {
  apiKeyCreateSchema,
  apiKeyCreationResponseSchema,
  apiKeyMetadataSchema,
  DEFAULT_BODY_LIMIT_BYTES,
  pageQuerySchema,
  repositoryPage,
  type KeyService,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

const params = z.object({ projectId: z.string() }).strict();
const revokeParams = params.extend({ keyId: z.string() });
const listResponse = z.object({
  data: z.array(apiKeyMetadataSchema),
  nextCursor: z.string().nullable(),
});

/** No operation permits bearer credentials, including when accompanied by a valid session cookie. */
export function keyRoutes(
  api: ApiRoutes,
  deps: { withTenant: WithTenant; keys: KeyService; enabledModules: readonly string[] },
) {
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/keys',
      operationId: 'listKeys',
      request: { params, query: pageQuerySchema },
      responses: {
        200: {
          description: 'Key metadata; secret credentials are never redisplayed.',
          content: { 'application/json': { schema: listResponse } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'key.list',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.keys.list(tx, repositoryPage(c.req.valid('query'))),
      );
      c.header('Cache-Control', 'no-store');
      return c.json(result, 200);
    },
  );
  api.register(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/keys',
      operationId: 'createKey',
      request: {
        params,
        body: {
          required: true,
          content: { 'application/json': { schema: apiKeyCreateSchema(deps.enabledModules) } },
        },
      },
      responses: {
        201: {
          description: 'The token is revealed only in this creation response.',
          content: { 'application/json': { schema: apiKeyCreationResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'key.create',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.keys.create(tx, c.req.valid('json'), c.get('requestId')),
      );
      c.header('Cache-Control', 'no-store');
      return c.json(result, 201);
    },
  );
  api.register(
    createRoute({
      method: 'delete',
      path: '/v1/projects/{projectId}/keys/{keyId}',
      operationId: 'revokeKey',
      request: { params: revokeParams },
      responses: { 204: { description: 'Key revoked. Repeated revocation is a no-op.' } },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'key.revoke',
    },
    async (c) => {
      await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.keys.revoke(tx, c.req.valid('param').keyId, c.get('requestId')),
      );
      c.header('Cache-Control', 'no-store');
      return c.body(null, 204);
    },
  );
}
