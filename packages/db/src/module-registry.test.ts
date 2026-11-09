import { expect, test } from 'bun:test';

import {
  createAuditService,
  createEventService,
  createIds,
  createRateLimiter,
  createServiceContainer,
  createUnlimitedEntitlements,
  createUsageService,
  defineRegistry,
} from '@backbricks/core';
import { sql } from 'drizzle-orm';

import { consumerModule, ledgerModule } from '../test/module-fixtures.ts';
import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
const clock = { now: () => new Date('2026-11-06T00:00:00Z') };

test.skipIf(!available)(
  'registered module hooks share scoped repositories, capabilities, usage, events and audit rollback',
  async () => {
    const fixture = await createTenantFixture();
    const common = { clock, ids: createIds(clock) };
    const usage = createUsageService(clock);
    const services = createServiceContainer({
      ...common,
      audit: createAuditService(common),
      events: createEventService(common),
      usage,
      entitlements: createUnlimitedEntitlements(),
      rateLimiter: createRateLimiter({ increment: async () => 1 }, clock),
    });
    const consumer = consumerModule();
    const registry = defineRegistry([consumer, ledgerModule()]).bind(services);
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    const other = { organizationId: 'org-b', projectId: fixture.projectIds.b1 };
    try {
      await fixture.handle.db.execute(
        'create table fixture_ledger (organization_id text not null, project_id text not null, amount bigint not null)',
      );
      const run = createWithTenant(fixture.handle.db, (dbTx, scope, assertActive) => ({
        ledger: {
          async append(amount) {
            assertActive();
            await dbTx.execute(
              sql`insert into fixture_ledger values (${scope.organizationId}, ${scope.projectId}, ${amount})`,
            );
          },
        },
      }));
      const route = consumer.adminRoutes[0];
      const job = consumer.jobs[0];
      const publicRoute = consumer.publicRoutes[0];
      if (!route || !job || !publicRoute) throw new Error('Missing registered hooks');
      const input = { params: { key: 'demo' }, query: {}, body: { amount: '3' } };
      await run(context, async (tx) => {
        const frame = registry.forTenant(tx);
        const execution = frame.execution('consumer');
        const response = await route.run(execution, input);
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ saved: true });
        const publicResponse = await publicRoute.run(execution, { ...input, body: null });
        expect(publicResponse.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await publicResponse.json()).toMatchInlineSnapshot(`
          {
            "available": true,
          }
        `);
        await job.run(execution, { amount: '4' });
        expect(
          await consumer.retention.purgeExpired(execution, { now: clock.now(), limit: 20 }),
        ).toBe(0);
        expect(await consumer.privacy.exportSubject(execution, 'person@example.invalid')).toEqual(
          [],
        );
        expect(await consumer.privacy.deleteSubject(execution, 'person@example.invalid')).toBe(0);
        const invalid = await job
          .run(execution, { amount: 'nope' })
          .catch((error: unknown) => error);
        expect(invalid).toBeInstanceOf(Error);
        expect(frame.capability('absent-capability')).toBeNull();
        expect(frame.capability('constructor')).toBeNull();
        expect(frame.capability('fixture-ledger')).toBe(frame.capability('fixture-ledger'));
        // A second frame in the same transaction cannot borrow the first frame's handle.
        const separate = registry.forTenant(tx);
        expect(() =>
          frame.capability('fixture-ledger')?.append(separate.execution('consumer').handle, 8n),
        ).toThrow('share the caller transaction');
      });
      const counts = async () => {
        const result = await fixture.handle.db.execute(
          sql`select organization_id, project_id, sum(amount)::text as amount from fixture_ledger group by organization_id, project_id`,
        );
        if (Array.isArray(result)) throw new Error('Expected a single query result');
        return result.rows;
      };
      expect(await counts()).toEqual([
        { organization_id: 'org-a', project_id: context.projectId, amount: '7' },
      ]);
      expect(await run(context, (tx) => usage.list(tx))).toEqual([
        { metric: 'consumer.appends', value: 1n },
      ]);
      expect(await run(other, (tx) => usage.list(tx))).toEqual([]);
      await fixture.handle.db.execute(
        "alter table audit_logs add constraint fixture_module_failure check (action <> 'consumer.fail')",
      );
      const failure = await run(context, async (tx) =>
        route.run(registry.forTenant(tx).execution('consumer'), {
          ...input,
          body: { amount: '100', failAudit: true },
        }),
      ).catch((error: unknown) => error);
      expect(failure).toMatchObject({ cause: { code: '23514' } });
      expect(await counts()).toEqual([
        { organization_id: 'org-a', project_id: context.projectId, amount: '7' },
      ]);
      await run(context, async (tx) => {
        expect(await usage.list(tx)).toEqual([{ metric: 'consumer.appends', value: 1n }]);
        expect(await tx.repositories.audit.list({ limit: 10 })).toHaveLength(1);
        expect(await tx.repositories.events.pending(10)).toHaveLength(1);
      });
    } finally {
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
);
