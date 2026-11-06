import {
  CONFIG_ACCESS,
  DEFAULT_BODY_LIMIT_BYTES,
  configDocumentSchema,
  configPlanResponseSchema,
  configWriteSchema,
  configApplyResponseSchema,
  type ConfigurationService,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

const params = z.object({ projectId: z.string() }).strict();
/** Read/plan share one config contract; no planner operation performs a write. */
export function configurationRoutes(
  api: ApiRoutes,
  deps: { configuration: ConfigurationService; withTenant: WithTenant },
) {
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/config',
      operationId: 'getProjectConfig',
      request: { params },
      responses: {
        200: {
          description: 'Configuration only, without credentials, recipients or personal records.',
          content: { 'application/json': { schema: configDocumentSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      ...CONFIG_ACCESS.read,
      isolationCase: 'config.read',
    },
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.configuration.read(tx),
      );
      return c.json(result, 200);
    },
  );
  api.register(
    createRoute({
      method: 'put',
      path: '/v1/projects/{projectId}/config',
      operationId: 'planProjectConfig',
      request: {
        params,
        query: z.object({ dryRun: z.enum(['true', 'false']) }).strict(),
        body: { required: true, content: { 'application/json': { schema: configWriteSchema } } },
      },
      responses: {
        200: {
          description:
            'Dry run requires config:read. Apply additionally requires config:write and config:destructive when needed, or an admin session.',
          content: {
            'application/json': {
              schema: z.union([configPlanResponseSchema, configApplyResponseSchema]),
            },
          },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      ...CONFIG_ACCESS.read,
      isolationCase: 'config.plan',
    },
    async (c) => {
      const body = c.req.valid('json');
      const result = await deps.withTenant(requireTenantContext(c), async (tx) =>
        c.req.valid('query').dryRun === 'true'
          ? deps.configuration.plan(tx, body.config)
          : deps.configuration.apply(tx, body.config, body.planHash, c.get('requestId')),
      );
      return c.json(result, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/schema/config',
      operationId: 'getConfigSchema',
      responses: {
        200: {
          description: 'Editor schema for selected operational modules.',
          content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
        },
      },
    }),
    { kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES },
    (c) => c.json(deps.configuration.schema(), 200),
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/types',
      operationId: 'getProjectTypes',
      request: { params, query: z.object({ lang: z.literal('ts').default('ts') }).strict() },
      responses: {
        200: {
          description: 'Generated configuration types.',
          content: { 'text/plain': { schema: z.string() } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      ...CONFIG_ACCESS.read,
      isolationCase: 'config.types',
    },
    async (c) => {
      const code = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.configuration.types(tx),
      );
      return c.text(code, 200);
    },
  );
}
