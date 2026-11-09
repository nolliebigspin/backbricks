import type { createDashboardAuth } from '@backbricks/auth';
import {
  AppError,
  createManagementAuthorizer,
  type AuthenticatedTenantContext,
  type Config,
  type SecretKeyResolver,
} from '@backbricks/core';
import { createOrganizationIdentityStore, createWithTenant, type Database } from '@backbricks/db';
import type { Context } from 'hono';

import type { AppEnv } from '../context.ts';
import type { ApiAuthorization } from '../http/api-routes.ts';

/** Compose credential providers with the one declared-permission resolver. */
export function createApiAuthorization(options: {
  config: Pick<Config, 'publicUrl'>;
  db: Database;
  auth: Pick<ReturnType<typeof createDashboardAuth>, 'getSession'>;
  resolveKey?: SecretKeyResolver;
}): ApiAuthorization {
  const authorize = createManagementAuthorizer({
    publicOrigin: new URL(options.config.publicUrl).origin,
    withTenant: createWithTenant(options.db),
    resolveKey: options.resolveKey,
    readSession: async (headers) => {
      const session = await options.auth.getSession(headers);
      return session
        ? {
            userId: session.user.id,
            emailVerified: session.user.emailVerified,
            activeOrganizationId: session.session.activeOrganizationId ?? null,
          }
        : null;
    },
    membership: (organizationId, userId) =>
      options.db.transaction((tx) =>
        createOrganizationIdentityStore(tx).membership(organizationId, userId),
      ),
  });
  return async (policy, context, tenant) => {
    const scope = await authorize(policy, {
      headers: context.req.raw.headers,
      method: context.req.method,
      origin: context.req.header('origin') ?? null,
      organizationId: tenant.organizationParam
        ? context.req.param(tenant.organizationParam)
        : undefined,
      projectId: tenant.projectParam ? context.req.param(tenant.projectParam) : undefined,
      projectScoped: tenant.projectParam !== undefined,
      requestId: context.get('requestId'),
      ipHash: context.get('ipHash'),
    });
    context.set('tenant', scope);
  };
}

/** Management handlers use the authorized snapshot, never a client-provided tenant context. */
export function requireTenantContext(context: Context<AppEnv>): AuthenticatedTenantContext {
  const tenant = context.get('tenant');
  if (!tenant) throw new AppError('unauthorized');
  return tenant;
}
