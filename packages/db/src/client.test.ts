import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { Client } from 'pg';

import { createTestDatabase, postgresAvailable } from '../test/test-database.ts';
import { createDatabase, databasePool } from './client.ts';

const available = await postgresAvailable();

describe.skipIf(!available)('database pool lifetime (real Postgres)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let admin: Client;
  const connections = async (applicationName: string) => {
    const result = await admin.query<{ n: number }>(
      'select count(*)::int as n from pg_stat_activity where datname = $1 and application_name = $2',
      [new URL(database.url).pathname.slice(1), applicationName],
    );
    return result.rows[0]?.n ?? 0;
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    admin = new Client({ connectionString: database.url });
    await admin.connect();
  });
  afterAll(async () => {
    await admin.end();
    await database.drop();
  });

  test('close resolves only after every pooled connection has disconnected', async () => {
    const handle = createDatabase(database.url, { applicationName: 'bb-close-test' });
    await Promise.all(Array.from({ length: 5 }, () => handle.db.execute('select pg_sleep(0.05)')));
    expect(await connections('bb-close-test')).toBe(5);
    await handle.close();
    expect(await connections('bb-close-test')).toBe(0);
  });

  test('a terminated idle connection neither crashes the process nor breaks the pool', async () => {
    const handle = createDatabase(database.url, { applicationName: 'bb-idle-test' });
    try {
      await handle.ping();
      const pool = databasePool(handle.db);
      expect(pool.idleCount).toBe(1);
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'bb-idle-test'",
      );
      for (let i = 0; i < 100 && pool.idleCount > 0; i++) {
        // oxlint-disable-next-line no-await-in-loop -- Waiting for the server-side termination to arrive.
        await Bun.sleep(10);
      }
      expect(pool.idleCount).toBe(0);
      await handle.ping();
    } finally {
      await handle.close();
    }
  });
});
