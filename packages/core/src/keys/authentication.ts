import type { z } from 'zod';

import type { RateLimiter } from '../abuse/rate-limiter.ts';
import { AppError } from '../errors/app-error.ts';
import { secretKeyIdentitySchema, type SecretKeyResolver } from '../identity/principal.ts';
import type { AuditService, EventService } from '../services/activity.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { TenantContext, TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { hashApiKey } from './material.ts';
import { secretKeyTokenSchema } from './protocol.ts';
import { keyScopesSchema } from './scopes.ts';

export const KEY_LAST_USED_INTERVAL_MS = 60_000;
export const KEY_EXPOSURE_NOTIFICATION_WINDOW_MS = 3_600_000;
export const secretKeyReferenceSchema = secretKeyIdentitySchema.omit({ scopes: true });
export type SecretKeyReference = z.infer<typeof secretKeyReferenceSchema>;
/** Narrow credential bootstrap returns only identifiers; no unscoped key metadata reaches callers. */
export type SecretKeyLookup = (hash: Uint8Array, now: Date) => Promise<SecretKeyReference | null>;
export type KeyExposureNotice = SecretKeyReference & { eventId: string };
type AuthenticationTransaction = <T>(
  context: TenantContext,
  operation: (tx: TenantTransaction, limiter: RateLimiter) => Promise<T>,
) => Promise<T>;

/** Resolve a secret, and commit rejection activity before throwing the HTTP-facing exposure error. */
export function createSecretKeyResolver(deps: {
  clock: Clock;
  publicOrigin: string;
  enabledModules: readonly string[];
  lookup: SecretKeyLookup;
  transaction: AuthenticationTransaction;
  audit: AuditService;
  events: EventService;
  /** Must only schedule delivery; durable metadata intent has already committed. */
  notify: (notice: KeyExposureNotice) => void;
}): SecretKeyResolver {
  const scopesSchema = keyScopesSchema(deps.enabledModules);
  return async (credential, request) => {
    try {
      if (!secretKeyTokenSchema.safeParse(credential).success) return null;
      const hash = await hashApiKey(credential);
      const now = deps.clock.now();
      const candidate = await deps.lookup(hash, now);
      if (!candidate) return null;
      const reference = secretKeyReferenceSchema.parse(candidate);
      const result = await deps.transaction(
        { organizationId: reference.organizationId, projectId: reference.projectId },
        async (tx, limiter) => {
          const key = await tx.repositories.keys.findByHash(hash, now);
          if (!key || key.id !== reference.id || key.kind !== 'secret') return null;
          const scopes = scopesSchema.safeParse(key.scopes);
          if (!scopes.success || scopes.data.length === 0) return null;
          const identity = secretKeyIdentitySchema.parse({ ...reference, scopes: scopes.data });
          if (request.origin !== null && request.origin !== deps.publicOrigin) {
            await deps.audit.record(tx, {
              actorType: 'api_key',
              actorId: key.id,
              action: 'key.exposed',
              targetType: 'key',
              targetId: key.id,
              changes: { reason: 'foreign_origin' },
              requestId: request.requestId,
              ipHash: request.ipHash ? new Uint8Array(Buffer.from(request.ipHash, 'hex')) : null,
            });
            const notification = await limiter.consume({
              namespace: 'auth.key_exposure_notification',
              identity: Buffer.from(hash).toString('hex'),
              limit: 1,
              windowMs: KEY_EXPOSURE_NOTIFICATION_WINDOW_MS,
            });
            const eventId = notification.allowed
              ? await deps.events.publish(tx, {
                  type: CORE_EVENTS.secretKeyExposed,
                  subjectType: 'key',
                  subjectId: key.id,
                  payload: { reason: 'foreign_origin' },
                })
              : null;
            return { identity, exposed: true, notice: eventId ? { ...reference, eventId } : null };
          }
          await tx.repositories.keys.touch(
            key.id,
            now,
            new Date(now.getTime() - KEY_LAST_USED_INTERVAL_MS),
          );
          return { identity, exposed: false, notice: null };
        },
      );
      if (!result) return null;
      if (result.exposed) {
        if (result.notice) deps.notify(result.notice);
        throw new AppError('secret_key_exposed');
      }
      return result.identity;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('service_unavailable');
    }
  };
}
