import { createIds, systemClock } from '@backbricks/core';

import { createDatabase } from '../src/client.ts';
import { runMigrations } from '../src/migrate.ts';
import { organization } from '../src/schema/auth.generated.ts';
import { projects } from '../src/schema/projects.ts';
import { createTestDatabase } from './test-database.ts';

/** Shared real-DB fixture: two organizations with two projects each. */
export async function createTenantFixture() {
  const database = await createTestDatabase();
  await runMigrations(database.url);
  const handle = createDatabase(database.url, { max: 1 });
  const ids = createIds(systemClock);
  const now = systemClock.now();
  const projectIds = {
    a1: ids.generate('prj'),
    a2: ids.generate('prj'),
    b1: ids.generate('prj'),
    b2: ids.generate('prj'),
  };
  await handle.db.insert(organization).values([
    { id: 'org-a', name: 'A', slug: 'a', createdAt: now },
    { id: 'org-b', name: 'B', slug: 'b', createdAt: now },
  ]);
  await handle.db.insert(projects).values([
    {
      id: projectIds.a1,
      organizationId: 'org-a',
      name: 'A1',
      slug: 'a1',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: projectIds.a2,
      organizationId: 'org-a',
      name: 'A2',
      slug: 'a2',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: projectIds.b1,
      organizationId: 'org-b',
      name: 'B1',
      slug: 'b1',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: projectIds.b2,
      organizationId: 'org-b',
      name: 'B2',
      slug: 'b2',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  return { database, handle, projectIds };
}
