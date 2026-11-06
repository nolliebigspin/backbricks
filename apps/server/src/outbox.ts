import {
  createOutboxDispatcher,
  MAX_MAINTENANCE_BATCH,
  renderAuthMail,
  type Config,
} from '@backbricks/core';
import {
  maintenanceOrganizationIds,
  securityRecipientsForTenant,
  type createPostgresQueue,
  type Database,
} from '@backbricks/db';

import type { ServerServices } from './services.ts';

/** Host-only composition; no maintenance/delivery capability is passed to HTTP module callbacks. */
export function createServerOutbox(
  config: Config,
  db: Database,
  services: ServerServices,
  queue: ReturnType<typeof createPostgresQueue>,
) {
  const mailer = services.container.optional('mailer');
  const dispatch = createOutboxDispatcher({
    clock: services.container.core.clock,
    consumers: services.jobs
      .filter((job) => job.consumes?.length)
      .map((job) => ({ name: job.name, types: job.consumes ?? [] })),
    enqueue: queue.enqueueEvent,
    ...(mailer
      ? {
          security: async (tx, event) => {
            const recipients = await securityRecipientsForTenant(tx);
            await queue.enqueueSecurityMail(
              tx,
              recipients.map((to) =>
                renderAuthMail(config.publicUrl, {
                  kind: 'secret_key_exposed',
                  to,
                  url: '/activity',
                }),
              ),
              event.id,
            );
          },
        }
      : {}),
  });
  return {
    dispatch,
    async tick(after?: string) {
      let more = false;
      const organizations = await maintenanceOrganizationIds(db, after);
      for (const organization of organizations) {
        // oxlint-disable-next-line no-await-in-loop -- Each org gets its own short, bounded transaction.
        const count = await services.withTenant({ organizationId: organization.id }, (tx) =>
          dispatch(tx, MAX_MAINTENANCE_BATCH),
        );
        more ||= count === MAX_MAINTENANCE_BATCH;
      }
      const last = organizations.at(-1);
      if (organizations.length === MAX_MAINTENANCE_BATCH && last) return { after: last.id };
      return more;
    },
  };
}
