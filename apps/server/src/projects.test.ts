import { expect, test } from 'bun:test';

import { projectResponseSchema } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const listSchema = z.object({
  data: z.array(projectResponseSchema),
  nextCursor: z.string().nullable(),
});

test.skipIf(!available)(
  'project CRUD validates, paginates and records structural activity without configuration values',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { request, owner, other, admin, organizationId, foreignId, db } = f;
      const create = () =>
        request('/v1/projects', { name: 'Private project label', slug: 'duplicate' }, owner.cookie);
      const concurrent = await Promise.all([create(), create()]);
      expect(concurrent.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([201, 409]);
      const success = concurrent.find((response) => response.status === 201);
      if (!success) throw new Error('Expected winning project');
      const project = projectResponseSchema.parse(await success.json());
      expect(project.organizationId).toBe(organizationId);
      expect((await create()).status).toBe(409);
      const otherProject = await request(
        '/v1/projects',
        { name: 'Other', slug: 'duplicate' },
        other.cookie,
      );
      expect(otherProject.status).toBe(201);
      expect(projectResponseSchema.parse(await otherProject.json()).organizationId).toBe(foreignId);
      const path = `/v1/projects/${project.id}`;
      const patch = {
        name: 'Private changed label',
        allowedOrigins: ['HTTPS://EXAMPLE.COM:443/'],
        settings: {},
      };
      expect((await request(path, patch, admin.cookie, undefined, 'PATCH')).status).toBe(200);
      const read = projectResponseSchema.parse(
        await (await request(path, undefined, owner.cookie)).json(),
      );
      expect(read.allowedOrigins).toEqual(['https://example.com']);
      expect(read.name).toBe('Private changed label');
      const activity = () =>
        createWithTenant(db)({ organizationId }, async ({ repositories }) => ({
          audit: await repositories.audit.list({ limit: 100 }),
          events: await repositories.events.pending(100),
        }));
      const before = await activity();
      expect((await request(path, patch, owner.cookie, undefined, 'PATCH')).status).toBe(200);
      expect(await activity()).toEqual(before);
      const entries = before.audit.filter((entry) => entry.targetId === project.id);
      expect(entries.map((entry) => entry.action).toSorted()).toEqual([
        'project.created',
        'project.updated',
      ]);
      expect(
        entries.every((entry) => entry.actorId === owner.id || entry.actorId === admin.id),
      ).toBe(true);
      expect(entries.every((entry) => entry.requestId?.startsWith('req_'))).toBe(true);
      expect(entries.find((entry) => entry.action === 'project.updated')?.changes).toEqual({
        changedFields: ['name', 'allowedOrigins'],
      });
      const serialized = JSON.stringify(before);
      expect(serialized).not.toContain('Private project label');
      expect(serialized).not.toContain('Private changed label');
      expect(serialized).not.toContain('example.com');
      const all = listSchema.parse(
        await (await request('/v1/projects', undefined, owner.cookie)).json(),
      );
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        // oxlint-disable-next-line no-await-in-loop -- Each page uses the preceding opaque cursor.
        const response = await request(
          `/v1/projects?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
          undefined,
          owner.cookie,
        );
        // oxlint-disable-next-line no-await-in-loop -- Decode before issuing the next page.
        const page = listSchema.parse(await response.json());
        expect(page.data).toHaveLength(1);
        ids.push(...page.data.map((row) => row.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toEqual(all.data.map((row) => row.id));
      expect(new Set(ids).size).toBe(ids.length);
      const document = await request('/v1/openapi.json');
      expect(document.status).toBe(200);
      expect(await document.text()).toContain('archiveProject');
      expect((await request('/v1/projects?cursor=abc', undefined, owner.cookie)).status).toBe(422);
      expect((await request('/v1/projects?limit=101', undefined, owner.cookie)).status).toBe(422);
      expect(
        (
          await request(
            path,
            { allowedOrigins: ['https://example.com/path'] },
            owner.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(422);
      expect((await request(path, { slug: 'a1' }, owner.cookie, undefined, 'PATCH')).status).toBe(
        409,
      );
      expect(
        (await request(path, patch, owner.cookie, { origin: 'https://foreign.invalid' }, 'PATCH'))
          .status,
      ).toBe(403);
      expect(
        (await request(path, undefined, owner.cookie)).headers.get('access-control-allow-origin'),
      ).toBeNull();
    });
  },
  20_000,
);

test.skipIf(!available)(
  'project create/update/archive roll back business state, audit and outbox on either activity failure',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      for (const table of ['audit_logs', 'events']) {
        const column = table === 'audit_logs' ? 'action' : 'type';
        // oxlint-disable-next-line no-await-in-loop -- Fixed test-only identifiers; isolate failure providers sequentially.
        await f.db.execute(
          `alter table ${table} add constraint fixture_project_failure check (${column} not in ('project.created', 'project.updated', 'project.archived'))`,
        );
        const operations = [
          {
            path: '/v1/projects',
            method: 'POST',
            body: { name: 'Rollback create', slug: 'rollback' },
          },
          { path: `/v1/projects/${f.a1.id}`, method: 'PATCH', body: { name: 'Rollback update' } },
          { path: `/v1/projects/${f.a1.id}`, method: 'DELETE', body: undefined },
        ];
        for (const operation of operations) {
          // oxlint-disable-next-line no-await-in-loop -- Each mutation has an independent real DB snapshot.
          const before = await f.snapshot();
          // oxlint-disable-next-line no-await-in-loop -- Failure must resolve before checking state.
          const response = await f.request(
            operation.path,
            operation.body,
            f.owner.cookie,
            undefined,
            operation.method,
          );
          expect(response.status).toBe(500);
          // oxlint-disable-next-line no-await-in-loop -- Error responses cannot expose SQL or raw failures.
          expect(await response.text()).not.toContain('fixture_project_failure');
          // oxlint-disable-next-line no-await-in-loop -- Verify the failed transaction has left no writes.
          expect(await f.snapshot()).toEqual(before);
        }
        // oxlint-disable-next-line no-await-in-loop -- Remove only this disposable database's fixture constraint.
        await f.db.execute(`alter table ${table} drop constraint fixture_project_failure`);
      }
    });
  },
  20_000,
);
