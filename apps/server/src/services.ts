import { createSmtpMailer } from '@backbricks/adapters';
import {
  createAuditService,
  createEventService,
  createIds,
  createKeyService,
  createProjectService,
  createRateLimiter,
  createServiceContainer,
  createUnlimitedEntitlements,
  createUsageService,
  systemClock,
  type Clock,
  type Config,
  type Entitlements,
} from '@backbricks/core';
import { createPostgresRateLimitStore, createWithTenant, type Database } from '@backbricks/db';

/** One provider/service lifetime per server runtime. Modules receive only the core's restricted views. */
export function createServerServices(
  config: Config,
  db: Database,
  options: { clock?: Clock; entitlements?: Entitlements } = {},
) {
  const clock = options.clock ?? systemClock;
  const ids = createIds(clock);
  const activity = { clock, ids };
  const mailer = config.mailer ? createSmtpMailer(config.mailer) : null;
  const container = createServiceContainer(
    {
      ...activity,
      audit: createAuditService(activity),
      events: createEventService(activity),
      usage: createUsageService(clock),
      entitlements: options.entitlements ?? createUnlimitedEntitlements(),
      rateLimiter: createRateLimiter(createPostgresRateLimitStore(db), clock),
    },
    { mailer },
  );
  return Object.freeze({
    container,
    withTenant: createWithTenant(db),
    projects: createProjectService(container.core),
    keys: createKeyService({ ...container.core, enabledModules: config.modules }),
    async close() {
      await mailer?.close();
    },
  });
}
export type ServerServices = ReturnType<typeof createServerServices>;
