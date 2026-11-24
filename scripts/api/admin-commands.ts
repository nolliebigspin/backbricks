// SPDX-License-Identifier: AGPL-3.0-only

import { jsonValueSchema } from '@backbricks/core';
import { z } from 'zod';

import { organizationRouteManifest } from '../../packages/auth/src/index.ts';

const operationSchema = z.object({
  operationId: z.string(),
  'x-backbricks-management': z.object({
    role: z.string().optional(),
    scope: z.string().optional(),
    channel: z.string().optional(),
  }),
});
const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
const pathSchema = z.object({ paths: z.record(z.string(), z.record(z.string(), jsonValueSchema)) });

/** Project/organization policy comes from the same registrars that authorize HTTP requests. */
export function adminCommands(document: unknown) {
  const management = Object.entries(pathSchema.parse(document).paths).flatMap(([path, entry]) =>
    methods.flatMap((method) => {
      const operation = entry[method];
      if (!operation || typeof operation !== 'object' || !('x-backbricks-management' in operation))
        return [];
      const result = operationSchema.parse(operation);
      const policy = result['x-backbricks-management'];
      if (policy.channel) return [];
      return [
        {
          id: result.operationId,
          method: method.toUpperCase(),
          path,
          role: policy.role ?? null,
          organizationSelector: false,
          scope: policy.scope ?? null,
        },
      ];
    }),
  );
  const organizations = organizationRouteManifest.map((route) => ({
    id: route.isolationCase,
    method: route.method,
    path: route.path,
    organizationSelector: route.organizationSelector,
    role: 'role' in route.requirement ? route.requirement.role : 'authenticated',
    scope: null,
  }));
  const entries = [...management, ...organizations];
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error('Administrative operation IDs must be unique.');
  return jsonValueSchema.parse(entries.toSorted((a, b) => a.id.localeCompare(b.id)));
}
