import { expect, test } from 'bun:test';

import { createPlatformQueries, createUsageService, systemClock } from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();

test.skipIf(!available)(
  'integration advertises only the HTTP origin and version path, never configured URL credentials',
  async () => {
    const fixture = await createTenantFixture();
    try {
      const queries = createPlatformQueries({
        clock: systemClock,
        usage: createUsageService(systemClock),
        publicUrl: 'https://user:never-echo@example.invalid/dashboard?private=value',
      });
      const result = await createWithTenant(fixture.handle.db)(
        { organizationId: 'org-a', projectId: fixture.projectIds.a1 },
        (tx) => queries.integration(tx),
      );
      expect(result.baseUrl).toBe('https://example.invalid/v1');
      expect(JSON.stringify(result)).not.toContain('never-echo');
      expect(JSON.stringify(result)).not.toContain('private=value');
    } finally {
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
);
