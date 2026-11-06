import { createSmtpMailer } from '@backbricks/adapters';
import { createDashboardAuth, bindAuthDatabase } from '@backbricks/auth';
import {
  createRateLimiter,
  createAuditService,
  createEventService,
  createIds,
  systemClock,
  type Config,
} from '@backbricks/core';
import {
  authSchema,
  createAuthReplayStore,
  createPostgresRateLimitStore,
  createOrganizationIdentityStore,
  createWithTenant,
  type Database,
} from '@backbricks/db';

import type { Logger } from './logger.ts';

/** Compose identity storage and delivery; auth receives only a request-bound adapter. */
export function createServerAuth(config: Config, db: Database, log: Logger) {
  const mailer = config.mailer ? createSmtpMailer(config.mailer) : null;
  const activity = { clock: systemClock, ids: createIds(systemClock) };
  const auth = createDashboardAuth({
    config,
    clock: systemClock,
    mailer,
    limiter: createRateLimiter(createPostgresRateLimitStore(db), systemClock),
    audit: createAuditService(activity),
    events: createEventService(activity),
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
      await mailer?.close();
    },
  };
}
