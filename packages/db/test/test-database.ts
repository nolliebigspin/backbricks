/**
 * Integration tests run against the compose Postgres (`mise run infra`), never a mock
 * (AGENTS.md §7). Each caller gets its own throwaway database. Locally the tests are
 * skipped when Postgres isn't running; in CI a missing database fails them.
 */
import { Client } from 'pg';

const adminUrl =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://backbricks:backbricks@localhost:5432/backbricks';

export async function postgresAvailable(): Promise<boolean> {
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 1000 });
  try {
    await client.connect();
    return true;
  } catch {
    if (process.env['CI']) throw new Error(`Postgres is not reachable at ${adminUrl}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function createTestDatabase(): Promise<{ url: string; drop(): Promise<void> }> {
  const name = `bb_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async drop() {
      const client = new Client({ connectionString: adminUrl });
      await client.connect();
      await client.query(`drop database if exists ${name} with (force)`);
      await client.end();
    },
  };
}
