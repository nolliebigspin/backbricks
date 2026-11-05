import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { sql } from 'drizzle-orm';

import { createTestDatabase, postgresAvailable } from '../test/test-database.ts';
import { createDatabase, type DatabaseHandle, type DbTransaction } from './client.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();

async function settings(tx: DbTransaction | DatabaseHandle['db']) {
  const result = await tx.execute<{ org: string | null; project: string | null }>(
    sql`select current_setting('app.org_id', true) as org,
               current_setting('app.project_id', true) as project`,
  );
  return result.rows[0];
}

describe.skipIf(!available)('withTenant (needs mise run infra)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let handle: DatabaseHandle;
  beforeAll(async () => {
    database = await createTestDatabase();
    // One connection, so "after the transaction" checks the very session the transaction used.
    handle = createDatabase(database.url, { max: 1 });
  });
  afterAll(async () => {
    await handle.close();
    await database.drop();
  });

  test('binds the tenant inside the transaction only', async () => {
    const withTenant = createWithTenant(handle.db);
    const inside = await withTenant({ organizationId: 'org_a', projectId: 'prj_b' }, settings);
    expect(inside).toEqual({ org: 'org_a', project: 'prj_b' });
    expect(await settings(handle.db)).toEqual({ org: '', project: '' });
  });

  test('without a project the project setting is empty', async () => {
    const withTenant = createWithTenant(handle.db);
    expect(await withTenant({ organizationId: 'org_a' }, settings)).toEqual({
      org: 'org_a',
      project: '',
    });
  });

  test('tenant values are bound as parameters, not spliced into SQL', async () => {
    const withTenant = createWithTenant(handle.db);
    const hostile = "org_x', true); drop table pg_class; --";
    expect((await withTenant({ organizationId: hostile }, settings))?.org).toBe(hostile);
  });

  test('errors roll back and propagate', async () => {
    const withTenant = createWithTenant(handle.db);
    await handle.db.execute(sql`create table if not exists probe (id int)`);
    const failing = withTenant({ organizationId: 'org_a' }, async (tx) => {
      await tx.execute(sql`insert into probe values (1)`);
      throw new Error('boom');
    });
    expect(failing).rejects.toThrow('boom');
    await failing.catch(() => {});
    const rows = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from probe`);
    expect(rows.rows[0]?.n).toBe(0);
  });

  test('refuses an empty organization', () => {
    const withTenant = createWithTenant(handle.db);
    expect(() => withTenant({ organizationId: '' }, settings)).toThrow('organizationId');
  });
});
