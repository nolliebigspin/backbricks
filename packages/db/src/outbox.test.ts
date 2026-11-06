import { expect, test } from 'bun:test';

import {
  createEventService,
  createIds,
  createOutboxDispatcher,
  outboxJobPayloadSchema,
  systemClock,
} from '@backbricks/core';

import { eventually } from '../../../scripts/test/eventually.ts';
import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createDatabase, databasePool } from './client.ts';
import { createPostgresQueue } from './queue.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
test.skipIf(!available)(
  'parallel outbox claims atomically enqueue stable consumers and retry safely after failures',
  async () => {
    const f = await createTenantFixture();
    const second = createDatabase(f.database.url);
    const firstScope = createWithTenant(f.handle.db);
    const secondScope = createWithTenant(second.db);
    const context = { organizationId: 'org-a', projectId: f.projectIds.a1 };
    const queue = createPostgresQueue(f.handle.db, [
      {
        name: 'fixture.consume',
        payload: outboxJobPayloadSchema,
        retries: 1,
        retentionSeconds: 3600,
      },
    ]);
    const events = createEventService({ clock: systemClock, ids: createIds(systemClock) });
    const dispatch = createOutboxDispatcher({
      clock: systemClock,
      consumers: [{ name: 'fixture.consume', types: ['fixture.created'] }],
      enqueue: queue.enqueueEvent,
    });
    const pool = databasePool(f.handle.db);
    try {
      await queue.start();
      await firstScope(context, async (tx) => {
        await events.publish(tx, { type: 'fixture.created', payload: { count: 1 } });
        await events.publish(tx, { type: 'fixture.created', payload: { count: 2 } });
      });
      const counts = await Promise.all([
        firstScope({ organizationId: 'org-a' }, (tx) => dispatch(tx, 100)),
        secondScope({ organizationId: 'org-a' }, (tx) => dispatch(tx, 100)),
      ]);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
      expect((await pool.query('select id from pgboss.job')).rows).toHaveLength(2);
      expect(await firstScope(context, (tx) => tx.repositories.events.pending(100))).toEqual([]);
      // A lost acknowledgement after commit can repeat dispatch without repeating the consumer job.
      await pool.query('update events set dispatched_at = null where organization_id = $1', [
        'org-a',
      ]);
      expect(await firstScope({ organizationId: 'org-a' }, (tx) => dispatch(tx, 100))).toBe(2);
      expect((await pool.query('select id from pgboss.job')).rows).toHaveLength(2);
      await firstScope(context, (tx) =>
        events.publish(tx, { type: 'fixture.created', payload: { count: 3 } }),
      );
      await pool.query(
        'alter table events add constraint fixture_dispatch_marker check (dispatched_at is null) not valid',
      );
      const failed = await firstScope(context, (tx) => dispatch(tx, 100)).catch(
        (error: unknown) => error,
      );
      expect(failed).toMatchObject({ cause: { code: '23514' } });
      expect((await pool.query('select id from pgboss.job')).rows).toHaveLength(2);
      expect(await firstScope(context, (tx) => tx.repositories.events.pending(100))).toHaveLength(
        1,
      );
      await pool.query('alter table events drop constraint fixture_dispatch_marker');
      const crash = createOutboxDispatcher({
        clock: systemClock,
        consumers: [{ name: 'fixture.consume', types: ['fixture.created'] }],
        enqueue: async (tx, event, consumer, payload) => {
          await queue.enqueueEvent(tx, event, consumer, payload);
          throw new Error('Crash before marker');
        },
      });
      expect(
        await firstScope(context, (tx) => crash(tx, 100)).catch((error: unknown) => error),
      ).toMatchObject({ message: 'Crash before marker' });
      expect((await pool.query('select id from pgboss.job')).rows).toHaveLength(2);
      expect(await firstScope(context, (tx) => dispatch(tx, 100))).toBe(1);
      await queue.consume(
        [
          {
            name: 'fixture.consume',
            async runInTransaction(tx, input) {
              const data = outboxJobPayloadSchema.parse(input);
              await tx.repositories.usage.increment(
                'fixture.received',
                '2026-11-01',
                BigInt(data.event.payload.count ?? 0),
              );
            },
          },
        ],
        firstScope,
      );
      await eventually(
        async () =>
          (await pool.query("select id from pgboss.job where state <> 'completed'")).rows.length ===
          0,
      );
      expect(await firstScope(context, (tx) => tx.repositories.usage.list('2026-11-01'))).toEqual([
        { metric: 'fixture.received', value: 6n },
      ]);
      expect(
        await secondScope({ organizationId: 'org-b', projectId: f.projectIds.b1 }, (tx) =>
          tx.repositories.usage.list('2026-11-01'),
        ),
      ).toEqual([]);
    } finally {
      await queue.stop();
      await second.close();
      await f.handle.close();
      await f.database.drop();
    }
  },
  15_000,
);
