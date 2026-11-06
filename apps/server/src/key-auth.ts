import { createSmtpMailer } from '@backbricks/adapters';
import {
  createAuditService,
  createEventService,
  createIds,
  createRateLimiter,
  createSecretKeyResolver,
  renderAuthMail,
  systemClock,
  type Clock,
  type Config,
  type KeyExposureNotice,
} from '@backbricks/core';
import {
  createPostgresRateLimitStore,
  createSecretKeyLookup,
  createWithTenant,
  securityRecipients,
  type Database,
} from '@backbricks/db';

import type { Logger } from './logger.ts';

/** Authentication and security delivery are separate from business transactions and survive HTTP rejection. */
export function createServerKeyAuth(
  config: Config,
  db: Database,
  log: Logger,
  clock: Clock = systemClock,
) {
  const mailer = config.mailer ? createSmtpMailer(config.mailer) : null;
  const deliveries = new Set<Promise<void>>();
  const activity = { clock, ids: createIds(clock) };
  const withTenant = createWithTenant(db);
  async function deliver(notice: KeyExposureNotice) {
    if (!mailer) {
      log.warn({ event: 'security.notification_pending' }, 'security service event');
      return;
    }
    const recipients = await securityRecipients(db, notice.organizationId);
    for (const to of recipients) {
      // oxlint-disable-next-line no-await-in-loop -- One recipient per bounded SMTP operation; no recipient list or content disclosure.
      await mailer.send(
        renderAuthMail(config.publicUrl, { kind: 'secret_key_exposed', to, url: '/activity' }),
      );
    }
    await withTenant(
      { organizationId: notice.organizationId, projectId: notice.projectId },
      ({ repositories }) => repositories.events.markDispatched(notice.eventId, clock.now()),
    );
  }
  const resolveKey = createSecretKeyResolver({
    ...activity,
    publicOrigin: new URL(config.publicUrl).origin,
    enabledModules: config.modules,
    lookup: createSecretKeyLookup(db),
    audit: createAuditService(activity),
    events: createEventService(activity),
    transaction: (context, operation) =>
      db.transaction((tx) =>
        createWithTenant(tx)(context, (tenant) =>
          operation(tenant, createRateLimiter(createPostgresRateLimitStore(tx), clock)),
        ),
      ),
    notify: (notice) => {
      const delivery = deliver(notice).catch(() => {
        log.warn({ event: 'security.mail_failed' }, 'security service event');
      });
      deliveries.add(delivery);
      void delivery.then(() => deliveries.delete(delivery));
    },
  });
  return {
    resolveKey,
    async drain() {
      await Promise.all(deliveries);
    },
    async close() {
      await Promise.all(deliveries);
      await mailer?.close();
    },
  };
}
