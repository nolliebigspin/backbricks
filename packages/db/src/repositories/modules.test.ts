import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { TenantTransaction } from '@backbricks/core';

import { createTenantFixture } from '../../test/tenant-fixtures.ts';
import { postgresAvailable } from '../../test/test-database.ts';
import type { DatabaseHandle } from '../client.ts';
import { createWithTenant } from '../with-tenant.ts';
import { moduleRepositoryFactories, selectModuleRepositories } from './modules.ts';
import type { RepositoryScope } from './scope.ts';

const available = await postgresAvailable();

type ScopedProbe = { tenant(): { organizationId: string; projectId: string } };
declare module '@backbricks/core' {
  interface ModuleRepositories {
    alpha: ScopedProbe;
    beta: ScopedProbe;
  }
}
/** Factories receive the transaction's tenant scope; they never pick a tenant themselves. */
const scoped = (_tx: unknown, scope: RepositoryScope): ScopedProbe => ({
  tenant: () => scope.project(),
});
const factories = { alpha: scoped, beta: scoped };

describe.skipIf(!available)('module repository composition (real Postgres)', () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  let handle: DatabaseHandle;
  beforeAll(async () => {
    fixture = await createTenantFixture();
    handle = fixture.handle;
  });
  afterAll(async () => {
    await handle.close();
    await fixture.database.drop();
  });

  test('only enabled modules get a handle, bound to the transaction tenant', async () => {
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    const enabled = createWithTenant(handle.db, selectModuleRepositories(factories, ['alpha']));
    expect(
      await enabled(context, (tx) =>
        Promise.resolve({ keys: Object.keys(tx.modules), tenant: tx.modules.alpha?.tenant() }),
      ),
    ).toEqual({ keys: ['alpha'], tenant: context });
    const disabled = createWithTenant(handle.db, selectModuleRepositories(factories, []));
    expect(await disabled(context, (tx) => Promise.resolve(Object.keys(tx.modules)))).toEqual([]);
  });

  test('escaped module handles fail once the transaction ends (ADR-0024)', async () => {
    const withTenant = createWithTenant(handle.db, selectModuleRepositories(factories, ['beta']));
    let escaped: TenantTransaction['modules'] | undefined;
    await withTenant({ organizationId: 'org-b', projectId: fixture.projectIds.b1 }, (tx) => {
      escaped = tx.modules;
      return Promise.resolve();
    });
    expect(() => escaped?.beta?.tenant()).toThrow('Tenant transaction has already ended.');
  });

  test('production factories are listed explicitly', () => {
    // The server's composition typecheck enforces that these match the module interfaces.
    expect(Object.keys(moduleRepositoryFactories)).toEqual(['forms']);
  });
});
