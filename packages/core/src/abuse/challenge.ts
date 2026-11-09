import { createHash } from 'node:crypto';

import { AppError } from '../errors/app-error.ts';
import type { CredentialRequest } from '../identity/principal.ts';
import type { CaptchaProvider } from '../services/providers.ts';
import type { WithTenant } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { assertPublicOrigin } from './guard.ts';
import type { PublicCredentialResolver } from './public-credentials.ts';
import { publicCredentialSchema } from './public-credentials.ts';
import type { RateLimiter } from './rate-limiter.ts';

export const POW_TTL_SECONDS = 600;
const CHALLENGES_PER_IP_MINUTE = 20;
const CHALLENGES_PER_PROJECT_MINUTE = 600;

/** Bounded, project-bound challenge issuance; no tenant selector is accepted from an anonymous caller. */
export function createChallengeService(deps: {
  clock: Clock;
  captcha: CaptchaProvider;
  limiter: RateLimiter;
  withTenant: WithTenant;
  resolve: PublicCredentialResolver;
}) {
  return async (
    credential: string,
    request: CredentialRequest,
    allowOrigin?: (origin: string) => void,
  ) => {
    if (!request.ipHash) throw new AppError('service_unavailable');
    const ip = await deps.limiter.consume({
      namespace: 'public.challenge_ip',
      identity: request.ipHash,
      limit: CHALLENGES_PER_IP_MINUTE,
      windowMs: 60_000,
    });
    if (!ip.allowed) throw new AppError('rate_limited');
    const resolved = await deps.resolve(credential, request);
    if (!resolved) throw new AppError('not_found');
    const identity = publicCredentialSchema.parse(resolved);
    await deps.withTenant(
      { organizationId: identity.organizationId, projectId: identity.projectId },
      async (tx) => {
        const project = await tx.repositories.projects.get(identity.projectId);
        assertPublicOrigin(identity.kind, project.allowedOrigins, request.origin);
        if (request.origin !== null) allowOrigin?.(request.origin);
      },
    );
    const project = await deps.limiter.consume({
      namespace: 'public.challenge_project',
      identity: createHash('sha256').update(identity.projectId).digest('hex'),
      limit: CHALLENGES_PER_PROJECT_MINUTE,
      windowMs: 60_000,
    });
    if (!project.allowed) throw new AppError('rate_limited');
    return deps.captcha.create({
      projectId: identity.projectId,
      expiresAt: new Date(deps.clock.now().getTime() + POW_TTL_SECONDS * 1000),
    });
  };
}
