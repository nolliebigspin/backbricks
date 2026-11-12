export {
  createDatabase,
  type Database,
  type DatabaseHandle,
  type DbTransaction,
} from './client.ts';
export { MIGRATIONS_FOLDER, runMigrations } from './migrate.ts';
export { createWithTenant } from './with-tenant.ts';
export {
  moduleRepositoryFactories,
  selectModuleRepositories,
  type ModuleRepositoryFactory,
} from './repositories/modules.ts';
export type { RepositoryScope } from './repositories/scope.ts';
export { createPostgresRateLimitStore } from './repositories/rate-limits.ts';
export { createAuthReplayStore } from './repositories/auth-replay.ts';
export { createPowReplayStore } from './repositories/pow-replay.ts';
export { createOrganizationIdentityStore } from './repositories/organization-identity.ts';
export * as authSchema from './schema/auth.generated.ts';

export {
  createSecretKeyLookup,
  createPublishableKeyLookup,
} from './repositories/credential-bootstrap.ts';
export { securityRecipients } from './repositories/security-recipients.ts';

export { createPostgresQueue } from './queue.ts';

export {
  maintenanceOrganizationIds,
  securityRecipientsForTenant,
} from './repositories/maintenance-identity.ts';
