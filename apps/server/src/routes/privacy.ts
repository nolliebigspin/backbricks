import {
  subjectErasureResponseSchema,
  subjectExportResponseSchema,
  subjectRequestSchema,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';
import type { ServerServices } from '../services.ts';

const params = z.object({ projectId: z.string() }).strict();
const body = {
  required: true,
  content: { 'application/json': { schema: subjectRequestSchema } },
} as const;
const policy = (operation: string) => ({
  kind: 'management' as const,
  bodyLimitBytes: 1024,
  session: { role: 'admin' as const },
  isolationCase: `privacy.${operation}`,
  // Personal-data lookups are rare by nature; a tight limit blunts enumeration by a stolen session.
  rateLimit: { limit: 20, windowMs: 3_600_000 },
});

/** Data-subject access and erasure for one project; logic and audit live in core. */
export function privacyRoutes(
  api: ApiRoutes,
  services: Pick<ServerServices, 'privacy' | 'withTenant'>,
) {
  api.register(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/privacy/subject-export',
      operationId: 'privacy.subjectExport',
      request: { params, body },
      responses: {
        200: {
          description: "Every enabled module's records for the subject email, as JSON.",
          content: { 'application/json': { schema: subjectExportResponseSchema } },
        },
      },
    }),
    policy('export'),
    async (c) =>
      c.json(
        await services.withTenant(requireTenantContext(c), (tx) =>
          services.privacy.exportSubject(tx, c.req.valid('json')),
        ),
        200,
      ),
  );
  api.register(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/privacy/subject-delete',
      operationId: 'privacy.subjectDelete',
      request: { params, body },
      responses: {
        202: {
          description: "Erasure of the subject's records in every enabled module was queued.",
          content: { 'application/json': { schema: subjectErasureResponseSchema } },
        },
      },
    }),
    policy('delete'),
    async (c) =>
      c.json(
        await services.withTenant(requireTenantContext(c), (tx) =>
          services.privacy.eraseSubject(tx, c.req.valid('json')),
        ),
        202,
      ),
  );
}
