import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';

import { createTestDatabase, postgresAvailable } from '../test/test-database.ts';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate.ts';

const available = await postgresAvailable();

function fixtureMigrations(): string {
  const folder = mkdtempSync(join(tmpdir(), 'bb-migrations-'));
  const migration = join(folder, '20260101000000_create_things');
  mkdirSync(migration);
  // pg_sleep widens the window in which an unlocked second run would collide.
  writeFileSync(
    join(migration, 'migration.sql'),
    'select pg_sleep(0.3);\n--> statement-breakpoint\ncreate table things (id text primary key);\n',
  );
  return folder;
}

describe.skipIf(!available)('runMigrations (needs mise run infra)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.drop();
  });

  test('concurrent runs apply each migration exactly once', async () => {
    const folder = fixtureMigrations();
    const results = await Promise.all([
      runMigrations(database.url, folder),
      runMigrations(database.url, folder),
      runMigrations(database.url, folder),
    ]);
    expect(results.map((result) => result.applied).toSorted((a, b) => a - b)).toEqual([0, 0, 1]);

    const client = new Client({ connectionString: database.url });
    await client.connect();
    const rows = await client.query('select count(*)::int as n from drizzle.__drizzle_migrations');
    expect(rows.rows[0]).toEqual({ n: 1 });
    await client.query('select * from things');
    await client.end();
  });

  test('a second run is a no-op', async () => {
    expect(await runMigrations(database.url, fixtureMigrations())).toEqual({ applied: 0 });
  });

  test('the committed migration history applies cleanly', async () => {
    const fresh = await createTestDatabase();
    try {
      const { applied } = await runMigrations(fresh.url, MIGRATIONS_FOLDER);
      expect(applied).toBeGreaterThanOrEqual(0);
    } finally {
      await fresh.drop();
    }
  });
});
