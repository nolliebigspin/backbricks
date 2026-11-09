import {
  DEFAULT_BODY_LIMIT_BYTES,
  projectCreateSchema,
  projectPatchSchema,
  projectResponseSchema,
  pageQuerySchema,
  repositoryPage,
  pageResult,
  type Project,
  type ProjectService,
  type WithTenant,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';

const params = z.object({ projectId: z.string() }).strict();
const listResponse = z.object({
  data: z.array(projectResponseSchema),
  nextCursor: z.string().nullable(),
});
function serialize(project: Project) {
  return projectResponseSchema.parse({
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    slug: project.slug,
    allowedOrigins: project.allowedOrigins,
    settings: project.settings,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  });
}

/** Project management surface. All permissions come from these declarations; logic stays in core. */
export function projectRoutes(
  api: ApiRoutes,
  deps: { withTenant: WithTenant; projects: ProjectService },
) {
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects',
      operationId: 'listProjects',
      request: { query: pageQuerySchema },
      responses: {
        200: {
          description: 'Active projects in the selected organization.',
          content: { 'application/json': { schema: listResponse } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'member' },
      isolationCase: 'project.list',
    },
    async (c) => {
      const page = repositoryPage(c.req.valid('query'));
      const result = await deps.withTenant(requireTenantContext(c), async ({ repositories }) =>
        pageResult(await repositories.projects.list(page), page.limit),
      );
      return c.json({ data: result.data.map(serialize), nextCursor: result.nextCursor }, 200);
    },
  );
  api.register(
    createRoute({
      method: 'post',
      path: '/v1/projects',
      operationId: 'createProject',
      request: {
        body: { required: true, content: { 'application/json': { schema: projectCreateSchema } } },
      },
      responses: {
        201: {
          description: 'Project created.',
          content: { 'application/json': { schema: projectResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'project.create',
    },
    async (c) => {
      const project = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.projects.create(tx, c.req.valid('json'), c.get('requestId')),
      );
      return c.json(serialize(project), 201);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}',
      operationId: 'getProject',
      request: { params },
      responses: {
        200: {
          description: 'Active project configuration.',
          content: { 'application/json': { schema: projectResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'member' },
      secretKey: { scope: 'integration:read' },
      isolationCase: 'project.read',
    },
    async (c) => {
      const project = await deps.withTenant(requireTenantContext(c), ({ repositories }) =>
        repositories.projects.get(c.req.valid('param').projectId),
      );
      return c.json(serialize(project), 200);
    },
  );
  api.register(
    createRoute({
      method: 'patch',
      path: '/v1/projects/{projectId}',
      operationId: 'updateProject',
      request: {
        params,
        body: { required: true, content: { 'application/json': { schema: projectPatchSchema } } },
      },
      responses: {
        200: {
          description: 'Project updated.',
          content: { 'application/json': { schema: projectResponseSchema } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      secretKey: { scope: 'project:write' },
      isolationCase: 'project.update',
    },
    async (c) => {
      const project = await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.projects.update(
          tx,
          c.req.valid('param').projectId,
          c.req.valid('json'),
          c.get('requestId'),
        ),
      );
      return c.json(serialize(project), 200);
    },
  );
  api.register(
    createRoute({
      method: 'delete',
      path: '/v1/projects/{projectId}',
      operationId: 'archiveProject',
      request: { params },
      responses: {
        204: {
          description:
            'Configuration archived and access disabled. This is not personal-data erasure.',
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
      session: { role: 'admin' },
      isolationCase: 'project.archive',
    },
    async (c) => {
      await deps.withTenant(requireTenantContext(c), (tx) =>
        deps.projects.archive(tx, c.req.valid('param').projectId, c.get('requestId')),
      );
      return c.body(null, 204);
    },
  );
}
