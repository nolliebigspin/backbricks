import {
  AppError,
  hashApiKey,
  publicCredentialSchema,
  publishableKeyTokenSchema,
  type Clock,
  type PublicCredentialResolver,
  type SecretKeyLookup,
  type SecretKeyResolver,
  type WithTenant,
} from '@backbricks/core';

/** All post-bootstrap reads stay scoped. Publishable bootstrap is injected only after the I1 decision. */
export function createPublicCredentialResolver(deps: {
  clock: Clock;
  withTenant: WithTenant;
  resolveSecret: SecretKeyResolver;
  lookupPublishable?: SecretKeyLookup;
}): PublicCredentialResolver {
  return async (credential, request) => {
    try {
      if (!publishableKeyTokenSchema.safeParse(credential).success) {
        const identity = await deps.resolveSecret(credential, request);
        return identity ? publicCredentialSchema.parse({ ...identity, kind: 'secret' }) : null;
      }
      if (!deps.lookupPublishable) throw new AppError('service_unavailable');
      const hash = await hashApiKey(credential);
      const now = deps.clock.now();
      const reference = await deps.lookupPublishable(hash, now);
      if (!reference) return null;
      return deps.withTenant(
        { organizationId: reference.organizationId, projectId: reference.projectId },
        async (tx) => {
          const key = await tx.repositories.keys.findByHash(hash, now);
          if (
            !key ||
            key.id !== reference.id ||
            key.kind !== 'publishable' ||
            key.publicToken !== credential
          )
            return null;
          return publicCredentialSchema.parse({ ...reference, scopes: [], kind: 'publishable' });
        },
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('service_unavailable');
    }
  };
}
