import { AppError } from '../errors/app-error.ts';
import { meetsOrganizationRole, type ManagementRoutePolicy } from '../http/route-policy.ts';
import { isTypeId } from '../ids/type-id.ts';
import { API_KEY_PREFIXES } from '../keys/constants.ts';
import { secretKeyTokenSchema } from '../keys/protocol.ts';
import type { AuthenticatedTenantContext, WithTenant } from '../tenancy/tenant-context.ts';
import type { Membership } from './organization.ts';
import {
  principalSchema,
  secretKeyIdentitySchema,
  sessionIdentitySchema,
  type CredentialRequest,
  type SecretKeyResolver,
  type SessionIdentity,
} from './principal.ts';

export const ORGANIZATION_SELECTION_HEADER = 'X-Backbricks-Organization-Id';
export const CSRF_HEADER = 'X-Backbricks-CSRF';

export type ManagementRequest = CredentialRequest & {
  method: string;
  headers: Headers;
  organizationId?: string;
  projectId?: string;
  /** Derived from the registered path; an organization-wide operation never accepts a key. */
  projectScoped: boolean;
};
type Dependencies = {
  publicOrigin: string;
  readSession: (headers: Headers) => Promise<SessionIdentity | null>;
  membership: (organizationId: string, userId: string) => Promise<Membership | null>;
  withTenant: WithTenant;
  resolveKey?: SecretKeyResolver;
};

/** Resolve a credential before authorization; explicit Authorization never falls back to cookies. */
export function createManagementAuthorizer(deps: Dependencies) {
  async function resolve(
    policy: ManagementRoutePolicy,
    request: ManagementRequest,
  ): Promise<AuthenticatedTenantContext> {
    const authorization = request.headers.get('authorization');
    const selectedOrganization = request.headers.get(ORGANIZATION_SELECTION_HEADER);
    if (authorization !== null) {
      const [scheme, credential, ...rest] = authorization.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !credential || rest.length)
        throw new AppError('unauthorized');
      if (credential.startsWith(API_KEY_PREFIXES.publishable)) throw new AppError('forbidden');
      if (!secretKeyTokenSchema.safeParse(credential).success) throw new AppError('unauthorized');
      const resolved = await deps.resolveKey?.(credential, request);
      if (!resolved) throw new AppError('unauthorized');
      const parsed = secretKeyIdentitySchema.safeParse(resolved);
      if (!parsed.success) throw new AppError('internal_error');
      const key = parsed.data;
      if (request.origin !== null && request.origin !== deps.publicOrigin)
        throw new AppError('secret_key_exposed');
      if (
        (request.organizationId && request.organizationId !== key.organizationId) ||
        (selectedOrganization !== null && selectedOrganization !== key.organizationId) ||
        (request.projectId && request.projectId !== key.projectId)
      )
        throw new AppError('not_found');
      if (!request.projectScoped || !request.projectId) throw new AppError('forbidden');
      const context: AuthenticatedTenantContext = Object.freeze({
        organizationId: key.organizationId,
        projectId: key.projectId,
        principal: principalSchema.parse({ kind: 'secret_key', id: key.id, scopes: key.scopes }),
      });
      await deps.withTenant(context, async () => {});
      if (!policy.secretKey || !key.scopes.includes(policy.secretKey.scope))
        throw new AppError('forbidden');
      return context;
    }
    const resolved = await deps.readSession(request.headers);
    if (!resolved) throw new AppError('unauthorized');
    const parsed = sessionIdentitySchema.safeParse(resolved);
    if (!parsed.success) throw new AppError('internal_error');
    const session = parsed.data;
    if (!session.emailVerified) throw new AppError('forbidden');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      (request.origin !== null && request.origin !== deps.publicOrigin) ||
      request.headers.get('sec-fetch-site') === 'cross-site' ||
      (unsafe && (request.origin !== deps.publicOrigin || request.headers.get(CSRF_HEADER) !== '1'))
    )
      throw new AppError('forbidden');
    if (
      request.organizationId &&
      selectedOrganization !== null &&
      request.organizationId !== selectedOrganization
    )
      throw new AppError('not_found');
    const organizationId =
      request.organizationId ?? selectedOrganization ?? session.activeOrganizationId;
    if (!organizationId || organizationId.length > 128) throw new AppError('not_found');
    const membership = await deps.membership(organizationId, session.userId);
    if (
      !membership ||
      membership.organizationId !== organizationId ||
      membership.userId !== session.userId
    )
      throw new AppError('not_found');
    if (request.projectScoped && (!request.projectId || !isTypeId(request.projectId, 'prj')))
      throw new AppError('not_found');
    const context: AuthenticatedTenantContext = Object.freeze({
      organizationId,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      principal: principalSchema.parse({
        kind: 'session',
        id: session.userId,
        role: membership.role,
      }),
    });
    if (context.projectId) await deps.withTenant(context, async () => {});
    if (!policy.session || !meetsOrganizationRole(membership.role, policy.session.role))
      throw new AppError('forbidden');
    return context;
  }
  return async (
    policy: ManagementRoutePolicy,
    request: ManagementRequest,
  ): Promise<AuthenticatedTenantContext> => {
    try {
      return await resolve(policy, request);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('service_unavailable');
    }
  };
}
