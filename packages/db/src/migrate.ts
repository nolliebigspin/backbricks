import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/** The one migration history (ARCHITECTURE §B.5), generated with `bun run db:generate`. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

// Arbitrary, fixed key ("bbmg") shared by every process that runs migrations.
const MIGRATION_LOCK_KEY = 0x62_62_6d_67;

/**
 * Applies pending migrations. Drizzle's migrator takes no lock (ADR-0020), so this holds a
 * Postgres advisory lock on one dedicated connection, and Drizzle runs on that same
 * connection: concurrent `migrate` runs (several containers starting at once) wait for each
 * other and the later ones find nothing left to do.
 */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<{ applied: number }> {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'backbricks-migrate',
  });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    const before = await countApplied(client);
    await migrate(drizzle({ client }), { migrationsFolder });
    return { applied: (await countApplied(client)) - before };
  } finally {
    // Closing the session also releases the advisory lock if unlocking fails.
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

async function countApplied(client: Client): Promise<number> {
  // Two queries: Postgres resolves table names while parsing, even in an untaken CASE branch.
  const exists = await client.query<{ table: string | null }>(
    `select to_regclass('drizzle.__drizzle_migrations')::text as table`,
  );
  if (!exists.rows[0]?.table) return 0;
  const result = await client.query<{ count: number }>(
    'select count(*)::int as count from drizzle.__drizzle_migrations',
  );
  return result.rows[0]?.count ?? 0;
}
