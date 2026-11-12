import type { TenantRepositories } from '@backbricks/core';

import type { DbTransaction } from '../client.ts';
import { createActivityRepositories } from './activity.ts';
import { createInstanceRepositories } from './instances.ts';
import { createKeyRepository } from './keys.ts';
import { createNotificationRuleRepository } from './notification-rules.ts';
import { createProjectRepository } from './projects.ts';
import type { RepositoryScope } from './scope.ts';
import { createIdempotencyRepository, createUsageRepository } from './usage-and-idempotency.ts';

export function createTenantRepositories(
  tx: DbTransaction,
  scope: RepositoryScope,
): TenantRepositories {
  return Object.freeze({
    notificationRules: createNotificationRuleRepository(tx, scope),
    projects: createProjectRepository(tx, scope),
    keys: createKeyRepository(tx, scope),
    ...createInstanceRepositories(tx, scope),
    ...createActivityRepositories(tx, scope),
    usage: createUsageRepository(tx, scope),
    idempotency: createIdempotencyRepository(tx, scope),
  });
}
