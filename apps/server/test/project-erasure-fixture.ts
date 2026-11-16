import { expect } from 'bun:test';

import type { AuthFixture } from './auth-fixture.ts';

/** Assert physical project rows and every queued/active/finished payload are gone; audit remains structural. */
export async function assertProjectDataGone(db: AuthFixture['db'], projectId: string) {
  const tables = await db.execute<{ table_name: string }>(
    "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'project_id' and table_name <> 'audit_logs'",
  );
  expect(tables.rows.length).toBeGreaterThan(6);
  for (const { table_name: table } of tables.rows) {
    // oxlint-disable-next-line no-await-in-loop -- Verify each physical tenant table in the fixture's schema.
    const result = await db.execute<{ one: number }>(
      `select 1 as one from ${table} where project_id = '${projectId}'`,
    );
    expect([table, result.rows.length]).toEqual([table, 0]);
  }
  expect(
    (
      await db.execute<{ name: string }>(
        `select name from pgboss.job where data->>'projectId' = '${projectId}'`,
      )
    ).rows,
  ).toEqual([]);
}
