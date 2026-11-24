import { createDashboardAuth, bindAuthDatabase, type DashboardAuthOptions } from '@backbricks/auth';
import type { Config, MailMessage } from '@backbricks/core';
import {
  authSchema,
  createAuthReplayStore,
  createOrganizationIdentityStore,
  createWithTenant,
  type Database,
  type DbTransaction,
} from '@backbricks/db';

import type { Logger } from './logger.ts';
import type { ServerServices } from './services.ts';

/** Compose identity storage and delivery; auth receives only a request-bound adapter. */
export function serverAuthOptions(
  config: Config,
  db: Database,
  log: Logger,
  services: ServerServices,
  delivery?: { enqueueMail(tx: DbTransaction, messages: readonly MailMessage[]): Promise<void> },
): DashboardAuthOptions {
  const { clock, audit, events, rateLimiter } = services.container.core;
  const mailer = services.container.optional('mailer');
  return {
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
          enqueueMail: delivery ? (messages) => delivery.enqueueMail(tx, messages) : undefined,
        }),
      ),
    report: (event) => {
      if (event === 'auth.signed_in') log.info({ event }, 'authentication service event');
      else log.warn({ event }, 'authentication service event');
    },
  };
}

/** Start the guarded dashboard auth service. */
export function createServerAuth(...args: Parameters<typeof serverAuthOptions>) {
  const auth = createDashboardAuth(serverAuthOptions(...args));
  return {
    ...auth,
    close: async () => {
      await auth.drain();
    },
  };
}
