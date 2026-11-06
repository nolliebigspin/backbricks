import { expect, test } from 'bun:test';

import {
  createAuditService,
  createIds,
  createUnlimitedEntitlements,
  createUsageService,
  MAX_USAGE_VALUE,
} from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createDatabase } from './client.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();

test.skipIf(!available)(
  'usage service preserves concurrent increments across pools, UTC periods, isolation and transaction rollback',
  async () => {
    const fixture = await createTenantFixture();
    const second = createDatabase(fixture.database.url, { max: 8 });
    let now = new Date('2026-11-30T23:59:59.999Z');
    const clock = { now: () => new Date(now) };
    const usage = createUsageService(clock);
    const entitlements = createUnlimitedEntitlements();
    const audit = createAuditService({ clock, ids: createIds(clock) });
    const firstScope = createWithTenant(fixture.handle.db);
    const secondScope = createWithTenant(second.db);
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    try {
      await Promise.all(
        Array.from({ length: 80 }, (_, index) =>
          (index % 2 ? firstScope : secondScope)(context, (tx) =>
            usage.increment(tx, { metric: 'fixture.count', delta: 1n }),
          ),
        ),
      );
      expect(await firstScope(context, (tx) => usage.list(tx))).toEqual([
        { metric: 'fixture.count', value: 80n },
      ]);
      expect(
        await firstScope({ organizationId: 'org-a', projectId: fixture.projectIds.a2 }, (tx) =>
          usage.list(tx),
        ),
      ).toEqual([]);
      expect(
        await firstScope({ organizationId: 'org-b', projectId: fixture.projectIds.b1 }, (tx) =>
          usage.list(tx),
        ),
      ).toEqual([]);
      now = new Date('2026-12-01T00:00:00.000Z');
      await firstScope(context, (tx) =>
        usage.increment(tx, { metric: 'fixture.count', delta: 2n }),
      );
      expect(await firstScope(context, (tx) => usage.list(tx))).toEqual([
        { metric: 'fixture.count', value: 2n },
      ]);
      expect(await firstScope(context, (tx) => usage.list(tx, '2026-11-01'))).toEqual([
        { metric: 'fixture.count', value: 80n },
      ]);
      const decision = await firstScope(context, (tx) =>
        entitlements.check(tx, { metric: 'fixture.count', delta: MAX_USAGE_VALUE }),
      );
      expect(decision).toEqual({ allowed: true, limit: null, remaining: null });
      await fixture.handle.db.execute(
        "alter table audit_logs add constraint fixture_usage_failure check (action <> 'fixture.usage_failure')",
      );
      const failed = await firstScope(context, async (tx) => {
        await usage.increment(tx, { metric: 'fixture.count', delta: 20n });
        await tx.repositories.projects.update(context.projectId, { name: 'Must roll back' });
        await audit.record(tx, { actorType: 'system', action: 'fixture.usage_failure' });
      }).catch((error: unknown) => error);
      expect(failed).toMatchObject({ cause: { code: '23514' } });
      expect(await firstScope(context, (tx) => usage.list(tx))).toEqual([
        { metric: 'fixture.count', value: 2n },
      ]);
      expect(
        (
          await firstScope(context, ({ repositories }) =>
            repositories.projects.get(context.projectId),
          )
        ).name,
      ).toBe('A1');
      await firstScope(context, (tx) =>
        usage.increment(tx, { metric: 'fixture.large', delta: MAX_USAGE_VALUE }),
      );
      const overflow = await firstScope(context, (tx) =>
        usage.increment(tx, { metric: 'fixture.large', delta: 1n }),
      ).catch((error: unknown) => error);
      expect(overflow).toMatchObject({ cause: { code: '22003' } });
      expect(
        (await firstScope(context, (tx) => usage.list(tx))).find(
          (row) => row.metric === 'fixture.large',
        )?.value,
      ).toBe(MAX_USAGE_VALUE);
    } finally {
      await second.close();
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
);
