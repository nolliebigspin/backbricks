import {
  CONFIG_ACCESS,
  DEFAULT_BODY_LIMIT_BYTES,
  instancePreconditionSchema,
  instanceResponseSchema,
  instanceKeySchema,
  instanceVersionSchema,
  revisionResponseSchema,
  pageQuerySchema,
  repositoryPage,
  type InstanceService,
  type WithTenant,
  type RegisteredModule,
  type InstanceRevision,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

const params = z.object({ projectId: z.string(), key: instanceKeySchema });
const revisionParams = params.extend({ version: z.coerce.number().pipe(instanceVersionSchema) });
const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const serializeRevision = (row: InstanceRevision) =>
  revisionResponseSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });

/** Historical configurations remain immutable; rollback always writes a new version. */
export function instanceVersionRoutes(
  api: ApiRoutes,
  deps: { instances: InstanceService; withTenant: WithTenant },
  module: RegisteredModule,
) {
  const type = module.type;
  const path = `/v1/projects/{projectId}/${module.resourceName.plural}/{key}`;
  const policy = (operation: string, access: keyof typeof CONFIG_ACCESS) => ({
    kind: 'management' as const,
    bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
    ...CONFIG_ACCESS[access],
    isolationCase: `${type}.instance.${operation}`,
  });
  api.register(
    createRoute({
      method: 'get',
      path: `${path}/revisions`,
      operationId: `${type}.instance.revisions`,
      request: { params, query: pageQuerySchema },
      responses: {
        200: json(
          z.object({ data: z.array(revisionResponseSchema), nextCursor: z.string().nullable() }),
          'Immutable revision history.',
        ),
      },
    }),
    policy('revisions', 'read'),
    async (c) => {
      const result = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.instances.revisions(
          tx,
          type,
          c.req.valid('param').key,
          repositoryPage(c.req.valid('query')),
        ),
      );
      return c.json(
        {
          ...result,
          data: result.data.map(serializeRevision),
        },
        200,
      );
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: `${path}/revisions/{version}`,
      operationId: `${type}.instance.revision`,
      request: { params: revisionParams },
      responses: {
        200: json(revisionResponseSchema, 'Stored format and configuration of one revision.'),
      },
    }),
    policy('revision', 'read'),
    async (c) => {
      const { key, version } = c.req.valid('param');
      const row = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.instances.revision(tx, type, key, version),
      );
      return c.json(serializeRevision(row), 200);
    },
  );
  api.register(
    createRoute({
      method: 'post',
      path: `${path}/revisions/{version}/rollback`,
      operationId: `${type}.instance.rollback`,
      request: {
        params: revisionParams,
        body: {
          required: true,
          content: { 'application/json': { schema: instancePreconditionSchema } },
        },
      },
      responses: {
        200: json(
          instanceResponseSchema,
          'New revision restoring the selected historical configuration.',
        ),
      },
    }),
    policy('rollback', 'write'),
    async (c) => {
      const { key, version } = c.req.valid('param');
      const row = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.instances.rollback(
          tx,
          type,
          key,
          version,
          c.req.valid('json').configVersion,
          c.get('requestId'),
        ),
      );
      return c.json(
        { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
        200,
      );
    },
  );
  api.register(
    createRoute({
      method: 'post',
      path: `${path}/migrate`,
      operationId: `${type}.instance.migrate`,
      request: {
        params,
        body: {
          required: true,
          content: { 'application/json': { schema: instancePreconditionSchema } },
        },
      },
      responses: {
        200: json(
          instanceResponseSchema,
          'Persist the current format with transactional revision and audit.',
        ),
      },
    }),
    policy('migrate', 'write'),
    async (c) => {
      const row = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.instances.migrate(
          tx,
          type,
          c.req.valid('param').key,
          c.req.valid('json').configVersion,
          c.get('requestId'),
        ),
      );
      return c.json(
        { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
        200,
      );
    },
  );
}
