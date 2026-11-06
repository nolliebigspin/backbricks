import {
  DEFAULT_BODY_LIMIT_BYTES,
  authCapabilitiesSchema,
  platformMetaSchema,
  type SelectedModules,
} from '@backbricks/core';
import { createRoute, type z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';

/** Public installation availability only; no tenant data, configuration or provider details. */
export function metaRoutes(
  api: ApiRoutes,
  modules: SelectedModules,
  auth: z.infer<typeof authCapabilitiesSchema>,
) {
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/auth/capabilities',
      operationId: 'getAuthCapabilities',
      responses: {
        200: {
          description: 'Public account-flow availability.',
          content: { 'application/json': { schema: authCapabilitiesSchema } },
        },
      },
    }),
    { kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES },
    (c) => {
      c.header('Cache-Control', 'no-store');
      return c.json(auth, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/meta',
      operationId: 'getPlatformMeta',
      responses: {
        200: {
          description: 'Shipped, selected and operational modules.',
          content: {
            'application/json': { schema: platformMetaSchema },
          },
        },
      },
    }),
    { kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES },
    (c) => {
      c.header('Cache-Control', 'no-store');
      return c.json(modules.metadata, 200);
    },
  );
}
