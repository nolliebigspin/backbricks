import { expect, test } from 'bun:test';

import {
  createAuditService,
  createEventService,
  createIds,
  createKeyService,
  systemClock,
} from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();

test.skipIf(!available)(
  'key service rejects non-admin/non-session callers and empty disabled-module presets before writing',
  async () => {
    const fixture = await createTenantFixture();
    try {
      const dependencies = { clock: systemClock, ids: createIds(systemClock) };
      const service = createKeyService({
        ...dependencies,
        enabledModules: [],
        audit: createAuditService(dependencies),
        events: createEventService(dependencies),
      });
      const withTenant = createWithTenant(fixture.handle.db);
      const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
      const keyId = dependencies.ids.generate('key');
      const input = { kind: 'secret', name: 'Denied', preset: 'agent', expiresAt: null } as const;
      const principals = [
        { kind: 'secret_key', id: keyId, scopes: ['stats:read'] },
        { kind: 'session', id: 'member_fixture', role: 'member' },
      ] as const;
      for (const principal of principals) {
        // oxlint-disable-next-line no-await-in-loop -- Independently exercise both actor classes through a real scoped transaction.
        const failure = await withTenant({ ...context, principal }, (tx) =>
          service.create(tx, input),
        ).catch((error: unknown) => error);
        expect(failure).toMatchObject({ code: 'forbidden' });
      }
      const empty = await withTenant(
        { ...context, principal: { kind: 'session', id: 'owner_fixture', role: 'owner' } },
        (tx) => service.create(tx, { ...input, preset: 'server_integration' }),
      ).catch((error: unknown) => error);
      expect(empty).toMatchObject({ code: 'validation_failed' });
      await withTenant(context, async ({ repositories }) => {
        expect(await repositories.keys.list({ limit: 100 })).toEqual([]);
        expect(await repositories.audit.list({ limit: 100 })).toEqual([]);
        expect(await repositories.events.pending(100)).toEqual([]);
      });
    } finally {
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
);
