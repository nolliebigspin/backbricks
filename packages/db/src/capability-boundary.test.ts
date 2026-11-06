import { expect, test } from 'bun:test';

import {
  bindCapability,
  createAuditService,
  createIds,
  createUsageService,
  type TenantTransaction,
} from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createDatabase } from './client.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
const clock = { now: () => new Date('2026-11-06T00:00:00Z') };
const usage = createUsageService(clock);
const audit = createAuditService({ clock, ids: createIds(clock) });
function writer() {
  return {
    write(tx: TenantTransaction, delta: bigint) {
      return usage.increment(tx, { metric: 'fixture.capability', delta });
    },
  };
}

test.skipIf(!available)(
  'bound capabilities reject foreign/separate/expired handles and share rollback with caller writes',
  async () => {
    const fixture = await createTenantFixture();
    const second = createDatabase(fixture.database.url, { max: 2 });
    const run = createWithTenant(fixture.handle.db);
    const other = createWithTenant(second.db);
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    let expired: TenantTransaction | undefined;
    let escaped: ReturnType<typeof writer> | undefined;
    try {
      await run(context, async (tx) => {
        const capability = bindCapability(tx, writer());
        await capability.write(tx, 1n);
        await other(
          { organizationId: 'org-b', projectId: fixture.projectIds.b1 },
          async (foreign) => {
            expect(() => capability.write(foreign, 5n)).toThrow('Not found');
          },
        );
        await other(context, async (separate) => {
          expect(() => capability.write(separate, 5n)).toThrow('share the caller transaction');
        });
        expired = tx;
        escaped = capability;
      });
      if (!expired || !escaped) throw new Error('Expected completed capability fixture');
      const completed = { capability: escaped, tx: expired };
      expect(() => completed.capability.write(completed.tx, 1n)).toThrow('already ended');
      expect(
        await other({ organizationId: 'org-b', projectId: fixture.projectIds.b1 }, (tx) =>
          usage.list(tx),
        ),
      ).toEqual([]);
      expect(await run(context, (tx) => usage.list(tx))).toEqual([
        { metric: 'fixture.capability', value: 1n },
      ]);
      await fixture.handle.db.execute(
        "alter table audit_logs add constraint fixture_capability_failure check (action <> 'fixture.capability_failure')",
      );
      const failure = await run(context, async (tx) => {
        await usage.increment(tx, { metric: 'fixture.consumer', delta: 1n });
        await bindCapability(tx, writer()).write(tx, 3n);
        await audit.record(tx, { actorType: 'system', action: 'fixture.capability_failure' });
      }).catch((error: unknown) => error);
      expect(failure).toMatchObject({ cause: { code: '23514' } });
      expect(await run(context, (tx) => usage.list(tx))).toEqual([
        { metric: 'fixture.capability', value: 1n },
      ]);
    } finally {
      await second.close();
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
);
