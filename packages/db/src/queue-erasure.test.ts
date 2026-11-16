import { expect, test } from 'bun:test';

import { PLATFORM_JOBS, systemClock } from '@backbricks/core';
import { z } from 'zod';

import { eventually } from '../../../scripts/test/eventually.ts';
import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { databasePool } from './client.ts';
import { createPostgresQueue } from './queue.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
test.skipIf(!available)(
  'project erasure purges active child payloads while preserving its exact running queue job for atomic completion',
  async () => {
    const fixture = await createTenantFixture();
    const pool = databasePool(fixture.handle.db);
    const withTenant = createWithTenant(fixture.handle.db);
    const context = {
      organizationId: 'org-a',
      projectId: fixture.projectIds.a1,
      archivedProject: true as const,
    };
    const definitions = [
      {
        name: PLATFORM_JOBS.projectErasure,
        retries: 0,
        retentionSeconds: 3600,
        payload: z.object({}).strict(),
      },
      {
        name: 'fixture.private',
        retries: 0,
        retentionSeconds: 3600,
        payload: z.object({ email: z.email() }).strict(),
      },
    ];
    const queue = createPostgresQueue(fixture.handle.db, definitions);
    let purged = -1;
    try {
      await queue.start();
      await pool.query('update projects set deleted_at = $1 where id = $2', [
        systemClock.now(),
        context.projectId,
      ]);
      await withTenant(context, (tx) =>
        queue.queue.enqueue(tx, 'fixture.private', { email: 'private-subject@example.test' }),
      );
      await pool.query("update pgboss.job set state = 'active' where name = 'fixture.private'");
      await withTenant({ organizationId: 'org-a' }, (tx) =>
        queue.projectErasure.enqueue(tx, context.projectId),
      );
      const current = (
        await pool.query<{ id: string }>('select id from pgboss.job where name = $1', [
          PLATFORM_JOBS.projectErasure,
        ])
      ).rows[0];
      if (!current) throw new Error('Missing erasure job');
      await queue.consume(
        [
          {
            name: PLATFORM_JOBS.projectErasure,
            async runInTransaction(tx) {
              purged = await queue.projectErasure.purgeJobs(tx);
            },
          },
        ],
        withTenant,
      );
      await eventually(
        async () =>
          (
            await pool.query<{ state: string }>(
              'select state from pgboss.job where name = $1 and id = $2',
              [PLATFORM_JOBS.projectErasure, current.id],
            )
          ).rows[0]?.state === 'completed',
      );
      expect(purged).toBe(1);
      const remaining = (
        await pool.query<{ name: string; state: string; data: unknown }>(
          'select name, state, data from pgboss.job',
        )
      ).rows;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({
        name: PLATFORM_JOBS.projectErasure,
        state: 'completed',
      });
      expect(JSON.stringify(remaining)).not.toContain('private-subject@example.test');
    } finally {
      await queue.stop();
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
  15_000,
);
