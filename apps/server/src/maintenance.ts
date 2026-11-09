import { MAX_MAINTENANCE_BATCH, PLATFORM_JOBS, type SystemJobResult } from '@backbricks/core';
import {
  maintenanceOrganizationIds,
  type createPostgresQueue,
  type Database,
} from '@backbricks/db';

import type { ServerServices } from './services.ts';

/** Worker-only capabilities and ID fan-out; no maintenance provider enters the HTTP service container. */
export function createServerMaintenance(
  db: Database,
  services: ServerServices,
  queue: ReturnType<typeof createPostgresQueue>,
) {
  const clock = services.container.core.clock;
  return {
    async cleanup(after?: string): Promise<SystemJobResult> {
      const now = clock.now();
      const global = await queue.maintenance.purgeGlobal(now);
      const jobs = await queue.purgeExpiredJobs(now);
      let more =
        jobs === MAX_MAINTENANCE_BATCH || Object.values(global).includes(MAX_MAINTENANCE_BATCH);
      const organizations = await maintenanceOrganizationIds(db, after);
      for (const organization of organizations) {
        // oxlint-disable-next-line no-await-in-loop -- An audit purge flag lives only in this org's transaction.
        const counts = await services.withTenant({ organizationId: organization.id }, (tx) =>
          queue.maintenance.purgeTenant(tx, now),
        );
        more ||= Object.values(counts).includes(MAX_MAINTENANCE_BATCH);
      }
      const last = organizations.at(-1);
      if (organizations.length === MAX_MAINTENANCE_BATCH && last) return { after: last.id };
      return more;
    },
    async fanout(runId: string, after?: string, job?: string): Promise<SystemJobResult> {
      const organizations = await maintenanceOrganizationIds(db, after);
      for (const organization of organizations) {
        // oxlint-disable-next-line no-await-in-loop -- Each bounded organization fan-out intent commits independently.
        await services.withTenant({ organizationId: organization.id }, (tx) =>
          queue.queue.enqueue(
            tx,
            PLATFORM_JOBS.maintenanceFanout,
            { runId, job },
            { singletonKey: `${runId}:${job ?? 'maintenance'}` },
          ),
        );
      }
      const last = organizations.at(-1);
      if (organizations.length === MAX_MAINTENANCE_BATCH && last) return { after: last.id };
    },
  };
}
