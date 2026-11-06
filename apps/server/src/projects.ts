import {
  createAuditService,
  createEventService,
  createIds,
  createProjectService,
  systemClock,
} from '@backbricks/core';
import { createWithTenant, type Database } from '@backbricks/db';

import type { ApiRoutes } from './http/api-routes.ts';
import { projectRoutes } from './routes/projects.ts';

/** Production and test composition share the same project routes and transaction-bound services. */
export function registerProjects(api: ApiRoutes, db: Database) {
  const dependencies = { clock: systemClock, ids: createIds(systemClock) };
  projectRoutes(api, {
    withTenant: createWithTenant(db),
    projects: createProjectService({
      ...dependencies,
      audit: createAuditService(dependencies),
      events: createEventService(dependencies),
    }),
  });
}
