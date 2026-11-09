import { projectErasureRequestSchema, projectErasureResponseSchema } from '@backbricks/core';
import { createRoute } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';
import type { ServerServices } from '../services.ts';

/**
 * Organization-scoped because archived projects are unreachable through project-bound routes
 * (ADR-0030); the erasure itself runs as a worker job (ADR-0061).
 */
export function projectErasureRoutes(
  api: ApiRoutes,
  services: Pick<ServerServices, 'projectErasure' | 'withTenant'>,
) {
  api.register(
    createRoute({
      method: 'post',
      path: '/v1/project-erasures',
      operationId: 'eraseProject',
      request: {
        body: {
          required: true,
          content: { 'application/json': { schema: projectErasureRequestSchema } },
        },
      },
      responses: {
        202: {
          description:
            "Hard erasure of an archived project's personal data was queued. The slug confirms it.",
          content: { 'application/json': { schema: projectErasureResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: 1024,
      session: { role: 'owner' },
      isolationCase: 'project.erase',
    },
    async (c) =>
      c.json(
        await services.withTenant(requireTenantContext(c), (tx) =>
          services.projectErasure.request(tx, c.req.valid('json')),
        ),
        202,
      ),
  );
}
