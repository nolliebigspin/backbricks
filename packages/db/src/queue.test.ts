import { expect, test } from 'bun:test';

import { type TenantTransaction } from '@backbricks/core';
import { z } from 'zod';

import { eventually } from '../../../scripts/test/eventually.ts';
import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { databasePool } from './client.ts';
import { createPostgresQueue } from './queue.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
const payload = z
  .object({
    amount: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .transform(BigInt),
  })
  .strict();
const definition = { name: 'fixture.add', retries: 2, retentionSeconds: 3600, payload };

test.skipIf(!available)(
  'pg-boss enlists enqueue/completion in real tenant transactions with rollback, validation and safe retries',
  async () => {
    const fixture = await createTenantFixture();
    const pool = databasePool(fixture.handle.db);
    const withTenant = createWithTenant(fixture.handle.db);
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    const reports: string[] = [];
    const queue = createPostgresQueue(fixture.handle.db, [definition], (name) =>
      reports.push(name),
    );
    let attempts = 0;
    try {
      await queue.start();
      const committed = await withTenant(context, (tx) =>
        queue.queue.enqueue(tx, definition.name, { amount: '3' }, { singletonKey: 'commit-once' }),
      );
      expect(typeof committed).toBe('string');
      expect(
        await withTenant(context, (tx) =>
          queue.queue.enqueue(
            tx,
            definition.name,
            { amount: '3' },
            { singletonKey: 'commit-once' },
          ),
        ),
      ).toBeNull();
      const failure = await withTenant(context, async (tx) => {
        await queue.queue.enqueue(tx, definition.name, { amount: '10' });
        throw new Error('Rollback fixture');
      }).catch((error: unknown) => error);
      expect(failure).toMatchObject({ message: 'Rollback fixture' });
      expect(
        await withTenant(context, (tx) => queue.queue.enqueue(tx, 'disabled.job', {})).catch(
          (error: unknown) => error,
        ),
      ).toMatchObject({ code: 'invalid_request' });
      expect(
        await withTenant(context, (tx) =>
          queue.queue.enqueue(tx, definition.name, { amount: 'invalid' }),
        ).catch((error: unknown) => error),
      ).toMatchObject({ code: 'validation_failed' });
      const rows = await pool.query<Record<string, unknown>>(
        'select id, state, data from pgboss.job',
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        id: committed,
        state: 'created',
        data: { organizationId: 'org-a', projectId: context.projectId, payload: { amount: '3' } },
      });
      let escaped: TenantTransaction | undefined;
      await withTenant(context, async (tx) => {
        escaped = tx;
      });
      if (!escaped) throw new Error('Expected escaped fixture handle');
      expect(
        await queue.queue
          .enqueue(escaped, definition.name, { amount: '1' })
          .catch((error: unknown) => error),
      ).toMatchObject({ message: 'Tenant transaction has already ended.' });
      await queue.consume(
        [
          {
            name: definition.name,
            async runInTransaction(tx, input) {
              attempts++;
              const parsed = payload.parse(input);
              await tx.repositories.usage.increment('fixture.total', '2026-11-01', parsed.amount);
              if (attempts === 1)
                throw new Error('This private error must not be persisted by pg-boss');
            },
          },
        ],
        withTenant,
      );
      await eventually(
        async () =>
          (
            await pool.query<Record<string, unknown>>(
              'select state from pgboss.job where id = $1',
              [committed],
            )
          ).rows[0]?.['state'] === 'completed',
      );
      expect(attempts).toBe(2);
      expect(await withTenant(context, (tx) => tx.repositories.usage.list('2026-11-01'))).toEqual([
        { metric: 'fixture.total', value: 3n },
      ]);
      expect(reports).toEqual([definition.name]);
      expect(
        JSON.stringify(
          (await pool.query<Record<string, unknown>>('select output from pgboss.job')).rows,
        ),
      ).not.toContain('private error');
      expect(
        await withTenant({ organizationId: 'org-b', projectId: fixture.projectIds.b1 }, (tx) =>
          tx.repositories.usage.list('2026-11-01'),
        ),
      ).toEqual([]);
    } finally {
      await queue.stop();
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
  15_000,
);

test.skipIf(!available)(
  'queue stop drains active transactions and allows their follow-up enqueue before closing the shared pool',
  async () => {
    const fixture = await createTenantFixture();
    const pool = databasePool(fixture.handle.db);
    const withTenant = createWithTenant(fixture.handle.db);
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    const queue = createPostgresQueue(fixture.handle.db, [definition]);
    const active = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    try {
      await queue.start();
      await withTenant(context, (tx) => queue.queue.enqueue(tx, definition.name, { amount: '1' }));
      await queue.consume(
        [
          {
            name: definition.name,
            async runInTransaction(tx) {
              active.resolve();
              await release.promise;
              await tx.repositories.usage.increment('fixture.total', '2026-11-01', 1n);
              await queue.queue.enqueue(
                tx,
                definition.name,
                { amount: '2' },
                { notBefore: new Date(Date.now() + 60_000) },
              );
            },
          },
        ],
        withTenant,
      );
      await active.promise;
      let stopped = false;
      const stopping = queue.stop().then(() => {
        stopped = true;
        return undefined;
      });
      await Bun.sleep(30);
      expect(stopped).toBe(false);
      release.resolve();
      await stopping;
      expect(await withTenant(context, (tx) => tx.repositories.usage.list('2026-11-01'))).toEqual([
        { metric: 'fixture.total', value: 1n },
      ]);
      expect(
        (
          await pool.query<Record<string, unknown>>('select state from pgboss.job order by state')
        ).rows.map((row) => row['state']),
      ).toEqual(['created', 'completed']);
      expect(
        await withTenant(context, (tx) =>
          queue.queue.enqueue(tx, definition.name, { amount: '1' }),
        ).catch((error: unknown) => error),
      ).toMatchObject({ code: 'service_unavailable' });
    } finally {
      release.resolve();
      await queue.stop();
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
  15_000,
);
