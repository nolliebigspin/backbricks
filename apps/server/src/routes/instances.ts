import {
  CONFIG_ACCESS,
  DEFAULT_BODY_LIMIT_BYTES,
  instanceCreateSchema,
  instancePatchSchema,
  instanceResponseSchema,
  instanceKeySchema,
  instanceVersionSchema,
  pageQuerySchema,
  repositoryPage,
  type ModuleInstance,
  type SelectedModules,
  type InstanceService,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

const projectParams = z.object({ projectId: z.string() }).strict();
const instanceParams = projectParams.extend({ key: instanceKeySchema });
const archiveQuery = z
  .object({ configVersion: z.coerce.number().pipe(instanceVersionSchema) })
  .strict();
const pageSchema = z.object({
  data: z.array(instanceResponseSchema),
  nextCursor: z.string().nullable(),
});
const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
function serialize(instance: ModuleInstance) {
  return instanceResponseSchema.parse({
    ...instance,
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  });
}

/** Only selected operational definitions get CRUD. Domain descriptors alone expose no placeholder API. */
export function instanceRoutes(
  api: ApiRoutes,
  deps: { modules: SelectedModules; instances: InstanceService; withTenant: WithTenant },
) {
  for (const module of deps.modules.registry.modules) {
    const type = module.type;
    const root = `/v1/projects/{projectId}/${module.resourceName.plural}`;
    const path = `${root}/{key}`;
    const policy = (operation: string, access: keyof typeof CONFIG_ACCESS) => ({
      kind: 'management' as const,
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      ...CONFIG_ACCESS[access],
      isolationCase: `${type}.instance.${operation}`,
    });
    api.register(
      createRoute({
        method: 'get',
        path: root,
        operationId: `${type}.instance.list`,
        request: { params: projectParams, query: pageQuerySchema },
        responses: { 200: json(pageSchema, 'Active and paused instance configurations.') },
      }),
      policy('list', 'read'),
      async (c) => {
        const page = repositoryPage(c.req.valid('query'));
        const result = await deps.withTenant(requireTenantContext(c), (tx) =>
          deps.instances.list(tx, type, page),
        );
        return c.json({ data: result.data.map(serialize), nextCursor: result.nextCursor }, 200);
      },
    );
    api.register(
      createRoute({
        method: 'post',
        path: root,
        operationId: `${type}.instance.create`,
        request: {
          params: projectParams,
          body: {
            required: true,
            content: { 'application/json': { schema: instanceCreateSchema } },
          },
        },
        responses: {
          201: json(instanceResponseSchema, 'Instance created with its initial revision.'),
        },
      }),
      policy('create', 'write'),
      async (c) => {
        const instance = await deps.withTenant(requireTenantContext(c), (tx) =>
          deps.instances.create(tx, type, c.req.valid('json'), c.get('requestId')),
        );
        return c.json(serialize(instance), 201);
      },
    );
    api.register(
      createRoute({
        method: 'get',
        path,
        operationId: `${type}.instance.read`,
        request: { params: instanceParams },
        responses: { 200: json(instanceResponseSchema, 'Instance configuration.') },
      }),
      policy('read', 'read'),
      async (c) => {
        const instance = await deps.withTenant(requireTenantContext(c), (tx) =>
          deps.instances.get(tx, type, c.req.valid('param').key),
        );
        return c.json(serialize(instance), 200);
      },
    );
    api.register(
      createRoute({
        method: 'patch',
        path,
        operationId: `${type}.instance.update`,
        request: {
          params: instanceParams,
          body: {
            required: true,
            content: { 'application/json': { schema: instancePatchSchema } },
          },
        },
        responses: {
          200: json(
            instanceResponseSchema,
            'Configuration merge patch; destructive changes additionally require config:destructive.',
          ),
        },
      }),
      policy('update', 'write'),
      async (c) => {
        const instance = await deps.withTenant(requireTenantContext(c), (tx) =>
          deps.instances.update(
            tx,
            type,
            c.req.valid('param').key,
            c.req.valid('json'),
            c.get('requestId'),
          ),
        );
        return c.json(serialize(instance), 200);
      },
    );
    api.register(
      createRoute({
        method: 'delete',
        path,
        operationId: `${type}.instance.archive`,
        request: { params: instanceParams, query: archiveQuery },
        responses: {
          204: {
            description:
              'Configuration archived, key reserved, revisions retained. Requires config:write and config:destructive; personal records are not erased.',
          },
        },
      }),
      policy('archive', 'write'),
      async (c) => {
        await deps.withTenant(requireTenantContext(c), (tx) =>
          deps.instances.archive(
            tx,
            type,
            c.req.valid('param').key,
            c.req.valid('query').configVersion,
            c.get('requestId'),
          ),
        );
        return c.body(null, 204);
      },
    );
  }
}
