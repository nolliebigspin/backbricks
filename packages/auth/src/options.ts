import { renderAuthMail, type MailMessage } from '@backbricks/core';
import type { BetterAuthOptions } from 'better-auth';

import type { AuthPersistence, DashboardAuthOptions } from './contracts.ts';
import { createAuthSchemaOptions } from './schema-options.ts';

export const AUTH_TOKEN_LIFETIME_SECONDS = 3600;
export const AUTH_BODY_LIMIT_BYTES = 64 * 1024;
export const AUTH_RATE_WINDOW_MS = 60_000;
export const AUTH_REQUEST_LIMIT = 100;
export const AUTH_CREDENTIAL_LIMIT = 10;
export const AUTH_RESPONSE_FLOOR_MS = 500;
export const AUTH_MAX_TOKEN_LENGTH = 4096;
const AUTH_MIN_PASSWORD_LENGTH = 12;

/** Request-scoped options keep hooks, transaction and deferred mail bound to this request. */
export function createDashboardAuthOptions(
  options: DashboardAuthOptions,
  persistence: AuthPersistence,
  pending: MailMessage[],
  ipHash?: string,
): BetterAuthOptions {
  const { config } = options;
  const secure = config.nodeEnv === 'production' || new URL(config.publicUrl).protocol === 'https:';
  return {
    ...createAuthSchemaOptions(),
    appName: 'Backbricks',
    baseURL: config.publicUrl,
    basePath: '/api/auth',
    secret: config.appSecret,
    database: persistence.database,
    trustedOrigins: [new URL(config.publicUrl).origin],
    logger: { disabled: true },
    onAPIError: { throw: true },
    rateLimit: { enabled: false }, // Shared Postgres limiter runs before dispatch.
    advanced: {
      ipAddress: { disableIpTracking: true },
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    },
    session: { cookieCache: { enabled: false } },
    verification: { storeIdentifier: 'hashed' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.signupPolicy !== 'open',
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: AUTH_MIN_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: AUTH_TOKEN_LIFETIME_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const link = new URL(url);
        if (!link.searchParams.get('callbackURL'))
          link.searchParams.set('callbackURL', '/reset-password');
        pending.push(
          renderAuthMail(config.publicUrl, {
            kind: 'reset_password',
            to: user.email,
            url: link.href,
          }),
        );
      },
    },
    emailVerification: {
      expiresIn: AUTH_TOKEN_LIFETIME_SECONDS,
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        pending.push(
          renderAuthMail(config.publicUrl, { kind: 'verify_email', to: user.email, url }),
        );
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({
            data: { ...session, ipAddress: ipHash ?? null, userAgent: null },
          }),
        },
        update: {
          before: async (session) => ({
            data: { ...session, ipAddress: ipHash ?? null, userAgent: null },
          }),
        },
      },
    },
  };
}
