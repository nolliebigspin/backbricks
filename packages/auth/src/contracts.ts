import type { AuthReplayStore, Clock, Config, Mailer, RateLimiter } from '@backbricks/core';
import type { BetterAuthOptions } from 'better-auth';

export type AuthPersistence = {
  database: NonNullable<BetterAuthOptions['database']>;
  replay: AuthReplayStore;
};
export type AuthTransactions = <T>(
  operation: (persistence: AuthPersistence) => Promise<T>,
) => Promise<T>;
export type DashboardAuthOptions = {
  config: Pick<Config, 'publicUrl' | 'appSecret' | 'nodeEnv' | 'signupPolicy'>;
  clock: Clock;
  mailer: Mailer | null;
  limiter: RateLimiter;
  transaction: AuthTransactions;
  /** Safe event names only; raw provider/library exceptions never reach application logging. */
  report: (event: 'auth.request_failed' | 'auth.mail_failed') => void;
};
