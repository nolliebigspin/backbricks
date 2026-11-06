import { expect, test } from 'bun:test';

import { PgBoss } from 'pg-boss';

import { eventually } from '../../../scripts/test/eventually.ts';
import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { databasePool } from './client.ts';
import { createPostgresQueue } from './queue.ts';

const available = await postgresAvailable();
test.skipIf(!available)(
  'scheduled work retains its run identity across durable cursor/repeat jobs and validates stored payloads',
  async () => {
    const f = await createTenantFixture();
    const pool = databasePool(f.handle.db);
    const reports: string[] = [];
    const queue = createPostgresQueue(f.handle.db, [], (name) => reports.push(name));
    const producer = new PgBoss({ db: { executeSql: (text, values) => pool.query(text, values) } });
    const observed: { runId: string; after?: string }[] = [];
    try {
      await queue.start();
      await producer.start();
      await queue.scheduleSystem('core.fixture.scan', '0 0 1 1 *', async (runId, after) => {
        observed.push({ runId, after });
        if (observed.length === 1) return { after: 'org-b' };
        if (observed.length === 2) return true;
        return undefined;
      });
      const id = await producer.send('core.fixture.scan', {});
      if (!id) throw new Error('Expected scheduled fixture job');
      await eventually(async () => observed.length === 3);
      expect(observed).toEqual([
        { runId: id, after: undefined },
        { runId: id, after: 'org-b' },
        { runId: id, after: undefined },
      ]);
      const invalid = await producer.send('core.fixture.scan', {
        privatePayload: 'must-not-enter-errors',
      });
      await eventually(async () => reports.length > 0);
      expect(observed).toHaveLength(3);
      expect(reports.every((name) => name === 'core.fixture.scan')).toBe(true);
      const output = await pool.query('select output from pgboss.job where id = $1', [invalid]);
      expect(JSON.stringify(output.rows)).not.toContain('must-not-enter-errors');
    } finally {
      await queue.stop();
      await producer.stop({ close: false });
      await f.handle.close();
      await f.database.drop();
    }
  },
  15_000,
);
