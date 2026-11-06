import {
  createAuditService,
  createEventService,
  createIds,
  createKeyService,
  systemClock,
} from '@backbricks/core';
import { createWithTenant, type Database } from '@backbricks/db';

import type { ApiRoutes } from './http/api-routes.ts';
import { keyRoutes } from './routes/keys.ts';

/** Compose key lifecycle with the same services and tenant transaction boundary as project management. */
export function registerKeys(api: ApiRoutes, db: Database, enabledModules: readonly string[]) {
  const dependencies = { clock: systemClock, ids: createIds(systemClock) };
  keyRoutes(api, {
    withTenant: createWithTenant(db),
    enabledModules,
    keys: createKeyService({
      ...dependencies,
      enabledModules,
      audit: createAuditService(dependencies),
      events: createEventService(dependencies),
    }),
  });
}
