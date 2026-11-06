import {
  CONFIG_ACCESS,
  DEFAULT_BODY_LIMIT_BYTES,
  configDocumentSchema,
  configPlanResponseSchema,
  configWriteSchema,
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
        query: z.object({ dryRun: z.literal('true') }).strict(),
        body: { required: true, content: { 'application/json': { schema: configWriteSchema } } },
      },
      responses: {
        200: {
          description: 'Read-only diff and expiring principal/state-bound plan.',
          content: { 'application/json': { schema: configPlanResponseSchema } },
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
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.configuration.plan(tx, c.req.valid('json').config),
      );
      return c.json(result, 200);
    },
  );
}
