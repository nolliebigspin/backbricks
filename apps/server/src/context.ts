import type { createDashboardAuth } from '@backbricks/auth';
import type { AuthenticatedTenantContext, createIpIdentity, Ids } from '@backbricks/core';

import type { Logger } from './logger.ts';

/** Per-request values set by the request-context middleware. */
export type AppEnv = {
  Variables: {
    requestId: string;
    ipHash?: string;
    tenant?: AuthenticatedTenantContext;
    log: Logger;
  };
};

/** A dependency `/readyz` checks; only services the enabled modules need are registered. */
export type ReadinessCheck = {
  name: string;
  check: () => Promise<void>;
};

/** What the HTTP app needs from the composition root (apps/server/src/main.ts). */
export type AppDependencies = {
  log: Logger;
  ids: Ids;
  /** Omitted only by apps/tests that do not mount auth or public-write handlers. */
  ipIdentity?: ReturnType<typeof createIpIdentity>;
  auth?: Pick<ReturnType<typeof createDashboardAuth>, 'handle' | 'basePath'>;
  readinessChecks: readonly ReadinessCheck[];
  /** Built dashboard to serve, or `null` (development: Vite serves it; API-only setups). */
  dashboardDir: string | null;
};
