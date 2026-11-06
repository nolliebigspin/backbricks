import {
  DEFAULT_BODY_LIMIT_BYTES,
  platformMetaSchema,
  type SelectedModules,
} from '@backbricks/core';
import { createRoute } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';

/** Public installation availability only; no tenant data, configuration or provider details. */
export function metaRoutes(api: ApiRoutes, modules: SelectedModules) {
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
