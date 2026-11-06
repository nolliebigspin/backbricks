import type {
  AuthReplayStore,
  AuditService,
  EventService,
  Clock,
  Config,
  Mailer,
  RateLimiter,
  OrganizationIdentityStore,
  WithTenant,
} from '@backbricks/core';
import type { BetterAuthOptions } from 'better-auth';

export type AuthPersistence = {
  database: NonNullable<BetterAuthOptions['database']>;
  replay: AuthReplayStore;
  identity: OrganizationIdentityStore;
  withTenant: WithTenant;
};
export type AuthTransactions = <T>(
  operation: (persistence: AuthPersistence) => Promise<T>,
) => Promise<T>;
export type DashboardAuthOptions = {
  config: Pick<Config, 'publicUrl' | 'appSecret' | 'nodeEnv' | 'signupPolicy'>;
  clock: Clock;
  mailer: Mailer | null;
  limiter: RateLimiter;
  audit: AuditService;
  events: EventService;
  transaction: AuthTransactions;
  /** Safe event names only; raw provider/library exceptions never reach application logging. */
  report: (event: 'auth.request_failed' | 'auth.mail_failed' | 'auth.signed_in') => void;
};
