import {
  createAuditService,
  createIds,
  principalSchema,
  secretKeyIdentitySchema,
  systemClock,
  type SecretKeyIdentity,
} from '@backbricks/core';
import { createWithTenant, type Database } from '@backbricks/db';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../src/http/api-routes.ts';
import { requireTenantContext } from '../src/middleware/authorization.ts';

const projectParams = z.object({ projectId: z.string() });
const projectBody = z.object({ id: z.string(), name: z.string() });
const principalBody = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  principal: principalSchema,
});

/** Synthetic routes only, never mounted by the production composition root. */
export function managementFixtureRoutes(api: ApiRoutes, db: Database) {
  const withTenant = createWithTenant(db);
  const audit = createAuditService({ clock: systemClock, ids: createIds(systemClock) });
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}/principal-fixture',
      request: { params: projectParams },
      responses: {
        200: {
          description: 'Trusted fixture identity.',
          content: { 'application/json': { schema: principalBody } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: 128,
      session: { role: 'member' },
      secretKey: { scope: 'integration:read' },
      isolationCase: 'fixture.principal',
    },
    (c) => {
      const context = requireTenantContext(c);
      return c.json(
        {
          organizationId: context.organizationId,
          projectId: context.projectId!,
          principal: context.principal,
        },
        200,
      );
    },
  );
  api.register(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/principal-fixture',
      request: {
        params: projectParams,
        body: {
          required: true,
          content: {
            'application/json': { schema: z.object({ name: z.string().min(1).max(30) }).strict() },
          },
        },
      },
      responses: {
        200: {
          description: 'Audited fixture mutation.',
          content: { 'application/json': { schema: projectBody } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: 128,
      session: { role: 'admin' },
      secretKey: { scope: 'project:write' },
      isolationCase: 'fixture.rename',
    },
    async (c) => {
      const context = requireTenantContext(c);
      return withTenant(context, async (tx) => {
        const project = await tx.repositories.projects.update(context.projectId!, {
          name: c.req.valid('json').name,
        });
        await audit.record(tx, {
          actorType: context.principal.kind === 'session' ? 'user' : 'api_key',
          actorId: context.principal.id,
          action: 'fixture.project_updated',
          targetType: 'project',
          targetId: project.id,
          changes: { changedFields: ['name'] },
        });
        return c.json({ id: project.id, name: project.name }, 200);
      });
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/projects',
      responses: {
        200: {
          description: 'Filtered collection.',
          content: { 'application/json': { schema: z.object({ data: z.array(projectBody) }) } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: 128,
      session: { role: 'member' },
      isolationCase: 'fixture.projects',
    },
    async (c) => {
      const data = await withTenant(requireTenantContext(c), ({ repositories }) =>
        repositories.projects.list({ limit: 100 }),
      );
      return c.json({ data: data.map(({ id, name }) => ({ id, name })) }, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/organizations/{organizationId}/audit-fixture',
      request: { params: z.object({ organizationId: z.string() }) },
      responses: {
        200: {
          description: 'Scoped audit count.',
          content: { 'application/json': { schema: z.object({ count: z.number() }) } },
        },
      },
    }),
    {
      kind: 'management',
      bodyLimitBytes: 128,
      session: { role: 'admin' },
      isolationCase: 'fixture.audit',
    },
    async (c) => {
      const records = await withTenant(requireTenantContext(c), ({ repositories }) =>
        repositories.audit.list({ limit: 100 }),
      );
      return c.json({ count: records.length }, 200);
    },
  );
}

/** Repository-backed fixture setup; these records are not production domain APIs. */
export async function insertProjectFixture(db: Database, organizationId: string, name: string) {
  const now = systemClock.now();
  return createWithTenant(db)({ organizationId }, ({ repositories }) =>
    repositories.projects.insert({
      id: createIds(systemClock).generate('prj'),
      name,
      slug: name.toLowerCase(),
      allowedOrigins: [],
      settings: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }),
  );
}

export async function insertKeyFixture(
  db: Database,
  project: { id: string; organizationId: string },
  hash: Uint8Array,
  scopes: string[],
): Promise<SecretKeyIdentity> {
  const context = { organizationId: project.organizationId, projectId: project.id };
  const key = await createWithTenant(db)(context, ({ repositories }) =>
    repositories.keys.insert({
      id: createIds(systemClock).generate('key'),
      kind: 'secret',
      name: 'Fixture',
      lookupHash: new Uint8Array(hash),
      displayPrefix: 'fixture',
      publicToken: null,
      scopes,
      createdBy: null,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: systemClock.now(),
    }),
  );
  return secretKeyIdentitySchema.parse({ id: key.id, ...context, scopes: key.scopes });
}
