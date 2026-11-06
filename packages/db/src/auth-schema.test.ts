import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { systemClock } from '@backbricks/core';
import { eq, sql } from 'drizzle-orm';

import { expectDatabaseError } from '../test/expect-database-error.ts';
import { createTestDatabase, postgresAvailable } from '../test/test-database.ts';
import { createDatabase, type DatabaseHandle } from './client.ts';
import { runMigrations } from './migrate.ts';
import * as authSchema from './schema/auth.generated.ts';

const available = await postgresAvailable();

describe.skipIf(!available)('generated auth schema (real Postgres)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let handle: DatabaseHandle;
  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.url);
    handle = createDatabase(database.url);
  });
  afterAll(async () => {
    await handle.close();
    await database.drop();
  });

  test('the committed migration has the auth expiry columns and is a no-op on rerun', async () => {
    const result = await handle.db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'expires_at' and is_nullable = 'NO'
        and table_name in ('invitation', 'session', 'verification')
      order by table_name
    `);
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'invitation',
      'session',
      'verification',
    ]);
    expect(await runMigrations(database.url)).toEqual({ applied: 0 });
  });

  test('auth identities, organizations and members use the generated schema and cascade removal', async () => {
    const now = systemClock.now();
    await handle.db.insert(authSchema.user).values({
      id: 'schema-user',
      name: 'Schema user',
      email: 'schema@example.invalid',
      createdAt: now,
      updatedAt: now,
    });
    await handle.db.insert(authSchema.organization).values({
      id: 'schema-org',
      name: 'Schema org',
      slug: 'schema-org',
      createdAt: now,
    });
    await handle.db.insert(authSchema.member).values({
      id: 'schema-member',
      organizationId: 'schema-org',
      userId: 'schema-user',
      role: 'owner',
      createdAt: now,
    });
    expect(await handle.db.select().from(authSchema.member)).toHaveLength(1);
    await expectDatabaseError(
      handle.db
        .insert(authSchema.member)
        .values({
          id: 'duplicate-member',
          organizationId: 'schema-org',
          userId: 'schema-user',
          role: 'member',
          createdAt: now,
        })
        .execute(),
      '23505',
    );
    await handle.db.delete(authSchema.user).where(eq(authSchema.user.id, 'schema-user'));
    expect(await handle.db.select().from(authSchema.member)).toEqual([]);
    expect(await handle.db.select().from(authSchema.organization)).toHaveLength(1);
  });
});
