import {
  auditPageSchema,
  auditQuerySchema,
  DEFAULT_BODY_LIMIT_BYTES,
  integrationResponseSchema,
  usageQuerySchema,
  usageResponseSchema,
  type PlatformQueries,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

/** Session-only activity, scoped aggregates, and explicitly safe integration metadata. */
export function platformReadRoutes(
  api: ApiRoutes,
  deps: { withTenant: WithTenant; queries: PlatformQueries },
) {
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/organizations/{organizationId}/audit-logs',
      operationId: 'listOrganizationActivity',
      request: { params: z.object({ organizationId: z.string() }), query: auditQuerySchema },
      responses: {
        200: {
          description: 'Organization activity without personal labels or network identity.',
          content: { 'application/json': { schema: auditPageSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'activity.organization',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.queries.activity(tx, c.req.valid('query')),
      );
      c.header('Cache-Control', 'no-store');
      return c.json(result, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/audit-logs',
      operationId: 'listProjectActivity',
      request: { params: z.object({ projectId: z.string() }), query: auditQuerySchema },
      responses: {
        200: {
          description: 'Project activity.',
          content: { 'application/json': { schema: auditPageSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'activity.project',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.queries.activity(tx, c.req.valid('query')),
      );
      c.header('Cache-Control', 'no-store');
      return c.json(result, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/usage',
      operationId: 'getProjectUsage',
      request: { params: z.object({ projectId: z.string() }), query: usageQuerySchema },
      responses: {
        200: {
          description: 'Monthly aggregate counters serialized as lossless decimal strings.',
          content: { 'application/json': { schema: usageResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'member' },
      secretKey: { scope: 'stats:read' },
      isolationCase: 'usage.project',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.queries.usage(tx, c.req.valid('query').period),
      );
      c.header('Cache-Control', 'no-store');
      return c.json(result, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/integration',
      operationId: 'getProjectIntegration',
      request: { params: z.object({ projectId: z.string() }) },
      responses: {
        200: {
          description:
            'Safe project metadata and the newest active publishable credential, or null.',
          content: { 'application/json': { schema: integrationResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'member' },
      secretKey: { scope: 'integration:read' },
      isolationCase: 'integration.project',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.queries.integration(tx),
      );
      c.header('Cache-Control', 'no-store');
      return c.json(result, 200);
    },
  );
}
