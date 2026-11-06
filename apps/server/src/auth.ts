import { createDashboardAuth, bindAuthDatabase } from '@backbricks/auth';
import type { Config } from '@backbricks/core';
import {
  authSchema,
  createAuthReplayStore,
  createOrganizationIdentityStore,
  createWithTenant,
  type Database,
} from '@backbricks/db';

import type { Logger } from './logger.ts';
import type { ServerServices } from './services.ts';

/** Compose identity storage and delivery; auth receives only a request-bound adapter. */
export function createServerAuth(
  config: Config,
  db: Database,
  log: Logger,
  services: ServerServices,
) {
  const { clock, audit, events, rateLimiter } = services.container.core;
  const mailer = services.container.optional('mailer');
  const auth = createDashboardAuth({
    config,
    clock,
    mailer,
    limiter: rateLimiter,
    audit,
    events,
    transaction: (operation) =>
      db.transaction((tx) =>
        operation({
          database: bindAuthDatabase(tx, authSchema),
          replay: createAuthReplayStore(tx),
          identity: createOrganizationIdentityStore(tx),
          withTenant: createWithTenant(tx),
        }),
      ),
    report: (event) => {
      if (event === 'auth.signed_in') log.info({ event }, 'authentication service event');
      else log.warn({ event }, 'authentication service event');
    },
  });
  return {
    ...auth,
    close: async () => {
      await auth.drain();
    },
  };
}
