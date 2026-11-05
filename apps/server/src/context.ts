import type { Ids } from '@backbricks/core';

import type { Logger } from './logger.ts';

/** Per-request values set by the request-context middleware. */
export type AppEnv = {
  Variables: {
    requestId: string;
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
  readinessChecks: readonly ReadinessCheck[];
};
