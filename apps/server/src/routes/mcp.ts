import {
  configApplyResponseSchema,
  configWriteSchema,
  DEFAULT_BODY_LIMIT_BYTES,
  httpOriginSchema,
  type ConfigurationService,
  type ProjectService,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

const params = z.object({ projectId: z.string() }).strict();

/** Scoped MCP mutations share the same services as the ordinary management routes. */
export function mcpRoutes(
  api: ApiRoutes,
  deps: { configuration: ConfigurationService; projects: ProjectService; withTenant: WithTenant },
) {
  api.register(
    createRoute({
      method: 'put',
      path: '/v1/projects/{projectId}/mcp/config',
      operationId: 'mcpApplyConfig',
      request: {
        params,
        body: {
          required: true,
          content: {
            'application/json': { schema: configWriteSchema.required({ planHash: true }) },
          },
        },
      },
      responses: {
        200: {
          description: 'Applied the previously planned configuration.',
          content: { 'application/json': { schema: configApplyResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      secretKey: { scope: 'config:write', channel: 'mcp' },
      isolationCase: 'mcp.config.apply',
    },
    async (c) => {
      const { config, planHash } = c.req.valid('json');
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.configuration.apply(tx, config, planHash, c.get('requestId')),
      );
      return c.json(result, 200);
    },
  );

  api.register(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/mcp/origins',
      operationId: 'mcpAddOrigin',
      request: {
        params,
        body: {
          required: true,
          content: {
            'application/json': { schema: z.object({ origin: httpOriginSchema }).strict() },
          },
        },
      },
      responses: {
        200: {
          description: 'The updated project origin allowlist.',
          content: {
            'application/json': { schema: z.object({ allowedOrigins: z.array(z.string()) }) },
          },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      secretKey: { scope: 'project:write', channel: 'mcp' },
      isolationCase: 'mcp.origins.add',
    },
    async (c) => {
      const { projectId } = c.req.valid('param');
      const { origin } = c.req.valid('json');
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.projects.addOrigin(tx, projectId, origin, c.get('requestId')),
      );
      return c.json({ allowedOrigins: result.allowedOrigins }, 200);
    },
  );
}
