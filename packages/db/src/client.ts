import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Database = NodePgDatabase;
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type DatabaseHandle = {
  db: Database;
  /** Readiness check: one round trip to Postgres. */
  ping(): Promise<void>;
  close(): Promise<void>;
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
  return {
    db: drizzle({ client: pool }),
    async ping() {
      await pool.query('select 1');
    },
    close: () => pool.end(),
  };
}
