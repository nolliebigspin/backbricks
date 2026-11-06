import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIds, systemClock, type TenantTransaction } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import type { DatabaseHandle, DbTransaction } from './client.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
const ids = createIds(systemClock);
let projectA: string;
let projectA2: string;
let projectB: string;
const now = systemClock.now();

declare module '@backbricks/core' {
  interface ModuleRepositories {
    probe: {
      settings(): Promise<{ org: string | null; project: string | null } | undefined>;
      write(value: number): Promise<void>;
    };
  }
}

async function settings(tx: DbTransaction | DatabaseHandle['db']) {
  const result = await tx.execute<{ org: string | null; project: string | null }>(
    sql`select current_setting('app.org_id', true) as org,
               current_setting('app.project_id', true) as project`,
  );
  return result.rows[0];
}

function probe(tx: TenantTransaction) {
  if (!tx.modules.probe) throw new Error('Expected the bound test repository.');
  return tx.modules.probe;
}

describe.skipIf(!available)('withTenant (needs mise run infra)', () => {
  let database: Awaited<ReturnType<typeof createTenantFixture>>['database'];
  let handle: DatabaseHandle;
  beforeAll(async () => {
    const fixture = await createTenantFixture();
    database = fixture.database;
    handle = fixture.handle;
    projectA = fixture.projectIds.a1;
    projectA2 = fixture.projectIds.a2;
    projectB = fixture.projectIds.b1;
    await handle.db.execute(sql`create table probe (organization_id text not null, value int)`);
  });
  afterAll(async () => {
    await handle.close();
    await database.drop();
  });

  function withTenant() {
    return createWithTenant(handle.db, (connection, context, assertActive) => ({
      probe: {
        async settings() {
          assertActive();
          return settings(connection);
        },
        async write(value) {
          assertActive();
          await connection.execute(
            sql`insert into probe values (${context.organizationId}, ${value})`,
          );
        },
      },
    }));
  }

  test('binds the tenant inside the transaction only', async () => {
    const inside = await withTenant()({ organizationId: 'org-a', projectId: projectA }, (tx) =>
      probe(tx).settings(),
    );
    expect(inside).toEqual({ org: 'org-a', project: projectA });
    expect(await settings(handle.db)).toEqual({ org: '', project: '' });
  });

  test('without a project the project setting is empty', async () => {
    expect(await withTenant()({ organizationId: 'org-a' }, (tx) => probe(tx).settings())).toEqual({
      org: 'org-a',
      project: '',
    });
  });

  test('tenant values are bound as parameters, not spliced into SQL', async () => {
    const hostile = "org_x', true); drop table pg_class; --";
    expect(
      (await withTenant()({ organizationId: hostile }, (tx) => probe(tx).settings()))?.org,
    ).toBe(hostile);
  });

  test('capability and core repository writes roll back together', async () => {
    const id = ids.generate('prj');
    const result = await withTenant()({ organizationId: 'org-a' }, async (tx) => {
      await probe(tx).write(1);
      await tx.repositories.projects.insert({
        id,
        name: 'Rollback',
        slug: 'rollback',
        allowedOrigins: [],
        settings: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      throw new Error('rollback');
    }).catch((error: unknown) => error);
    expect(result).toMatchObject({ message: 'rollback' });
    expect(
      (await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from probe`)).rows[0]
        ?.n,
    ).toBe(0);
    const list = await withTenant()({ organizationId: 'org-a' }, (tx) =>
      tx.repositories.projects.list({ limit: 100 }),
    );
    expect(list.map((project) => project.id)).not.toContain(id);
  });

  test('resources from other tenants are not found and lists stay scoped', async () => {
    const result = await withTenant()({ organizationId: 'org-a' }, (tx) =>
      tx.repositories.projects.get(projectB),
    ).catch((error: unknown) => error);
    expect(result).toMatchObject({ code: 'not_found' });
    const rows = await withTenant()({ organizationId: 'org-a' }, (tx) =>
      tx.repositories.projects.list({ limit: 100 }),
    );
    expect(rows.map((row) => row.id).toSorted()).toEqual([projectA, projectA2].toSorted());
    let called = false;
    const foreign = await withTenant()(
      { organizationId: 'org-b', projectId: projectA },
      async () => {
        called = true;
      },
    ).catch((error: unknown) => error);
    expect(foreign).toMatchObject({ code: 'not_found' });
    expect(called).toBe(false);
  });

  test('snapshotting the context prevents scope changes mid-transaction', async () => {
    const context = { organizationId: 'org-a' };
    const rows = await withTenant()(context, async (tx) => {
      context.organizationId = 'org-b';
      expect(tx.context.organizationId).toBe('org-a');
      return tx.repositories.projects.list({ limit: 100 });
    });
    expect(rows.map((row) => row.id).toSorted()).toEqual([projectA, projectA2].toSorted());
  });

  test('escaped repositories fail after the transaction ends and no driver is exposed', async () => {
    const escaped = await withTenant()({ organizationId: 'org-a' }, async (tx) => tx);
    expect('execute' in escaped).toBe(false);
    expect('db' in escaped).toBe(false);
    expect(
      await escaped.repositories.projects.list({ limit: 10 }).catch((error: unknown) => error),
    ).toMatchObject({ message: 'Tenant transaction has already ended.' });
    expect(
      await probe(escaped)
        .write(1)
        .catch((error: unknown) => error),
    ).toMatchObject({ message: 'Tenant transaction has already ended.' });
  });

  test('refuses an empty organization', () => {
    expect(() => withTenant()({ organizationId: '' }, async () => {})).toThrow('organizationId');
  });

  test('repository work can enlist in an outer auth transaction without committing early', async () => {
    const id = ids.generate('prj');
    const result = await handle.db
      .transaction(async (connection) => {
        await createWithTenant(connection)(
          { organizationId: 'org-a' },
          async ({ repositories }) => {
            await repositories.projects.insert({
              id,
              name: 'Outer',
              slug: 'outer',
              allowedOrigins: [],
              settings: {},
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
          },
        );
        throw new Error('outer rollback');
      })
      .catch((error: unknown) => error);
    expect(result).toMatchObject({ message: 'outer rollback' });
    const rows = await withTenant()({ organizationId: 'org-a' }, (tx) =>
      tx.repositories.projects.list({ limit: 100 }),
    );
    expect(rows.map((row) => row.id)).not.toContain(id);
  });
});
