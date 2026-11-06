import { renderAuthMail, type AuthInvitation, type MailMessage } from '@backbricks/core';
import type { BetterAuthOptions } from 'better-auth';

import {
  AUTH_BASE_PATH,
  AUTH_MIN_PASSWORD_LENGTH,
  AUTH_TOKEN_LIFETIME_SECONDS,
} from './constants.ts';
import type { AuthPersistence, DashboardAuthOptions } from './contracts.ts';
import { createOrganizationOptions } from './organizations/options.ts';
import { createAuthSchemaOptions } from './schema-options.ts';

/** Request-scoped options keep hooks, transaction and deferred mail bound to this request. */
export function createDashboardAuthOptions(
  options: DashboardAuthOptions,
  persistence: AuthPersistence,
  pending: MailMessage[],
  ipHash?: string,
  invitation?: AuthInvitation,
) {
  const { config } = options;
  const secure = config.nodeEnv === 'production' || new URL(config.publicUrl).protocol === 'https:';
  return {
    ...createAuthSchemaOptions(createOrganizationOptions(options, pending)),
    appName: 'Backbricks',
    baseURL: config.publicUrl,
    basePath: AUTH_BASE_PATH,
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
      disableSignUp: !invitation && config.signupPolicy !== 'open',
      requireEmailVerification: !invitation,
      autoSignIn: Boolean(invitation),
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
      sendOnSignUp: !invitation,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        pending.push(
          renderAuthMail(config.publicUrl, { kind: 'verify_email', to: user.email, url }),
        );
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({ data: invitation ? { ...user, emailVerified: true } : user }),
        },
      },
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
  } satisfies BetterAuthOptions;
}
