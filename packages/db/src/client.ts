import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Database = NodePgDatabase;
const pools = new WeakMap<Database, Pool>();

/** Internal queue adapter access; never exported from the package entry point. */
export function databasePool(db: Database): Pool {
  const pool = pools.get(db);
  if (!pool) throw new Error('Unknown database lifetime.');
  return pool;
}

export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type DatabaseHandle = {
  db: Database;
  /** Readiness check: one round trip to Postgres. */
  ping: () => Promise<void>;
  close: () => Promise<void>;
};

/** One `pg` pool per process, shared by Drizzle (and later pg-boss and Better Auth, ADR-0020). */
export function createDatabase(
  databaseUrl: string,
  options: { applicationName?: string; max?: number } = {},
): DatabaseHandle {
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name: options.applicationName ?? 'backbricks',
    max: options.max ?? 10,
  });
  const db = drizzle({ client: pool });
  pools.set(db, pool);
  return {
    db,
    ping: async () => {
      await pool.query('select 1');
    },
    close: async () => {
      pools.delete(db);
      await pool.end();
    },
  };
}
