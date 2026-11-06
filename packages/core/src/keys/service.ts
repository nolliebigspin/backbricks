import { AppError } from '../errors/app-error.ts';
import { pageResult } from '../http/pagination.ts';
import { meetsOrganizationRole } from '../http/route-policy.ts';
import type { Ids } from '../ids/type-id.ts';
import { principalActor, type AuditService, type EventService } from '../services/activity.ts';
import type { RepositoryPage } from '../tenancy/repositories.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { apiKeyCreateSchema, type ApiKeyCreate } from './creation.ts';
import { createApiKeyMaterial } from './material.ts';
import { apiKeyMetadata } from './metadata.ts';
import { keyPresetScopes } from './scopes.ts';

function managementSession(tx: TenantTransaction) {
  const principal = tx.context.principal;
  if (principal?.kind !== 'session' || !meetsOrganizationRole(principal.role, 'admin'))
    throw new AppError('forbidden');
  return principal;
}

/** Session-only key lifecycle; plaintext leaves only a committed creation call. */
export function createKeyService(deps: {
  clock: Clock;
  ids: Ids;
  audit: AuditService;
  events: EventService;
  enabledModules: readonly string[];
}) {
  const enabled = [...deps.enabledModules];
  const schema = apiKeyCreateSchema(enabled);
  return {
    async list(tx: TenantTransaction, page: RepositoryPage) {
      managementSession(tx);
      const result = pageResult(await tx.repositories.keys.list(page), page.limit);
      return { data: result.data.map(apiKeyMetadata), nextCursor: result.nextCursor };
    },
    async create(tx: TenantTransaction, input: ApiKeyCreate, requestId?: string) {
      const principal = managementSession(tx);
      const data = schema.parse(input);
      const now = deps.clock.now();
      const expiresAt = data.expiresAt === null ? null : new Date(data.expiresAt);
      if (expiresAt && expiresAt.getTime() <= now.getTime())
        throw new AppError('validation_failed', { detail: 'Key expiry must be in the future.' });
      const preset = 'preset' in data ? data.preset : undefined;
      const scopes = preset
        ? keyPresetScopes(preset, enabled)
        : 'scopes' in data
          ? data.scopes
          : [];
      if (data.kind === 'secret' && scopes.length === 0)
        throw new AppError('validation_failed', {
          detail: 'A secret key requires at least one enabled scope.',
        });
      const material = await createApiKeyMaterial(data.kind);
      const key = await tx.repositories.keys.insert({
        ...material.stored,
        id: deps.ids.generate('key'),
        name: data.name,
        scopes,
        createdBy: principal.id,
        createdAt: now,
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
      });
      const changes = {
        scopes,
        ...(preset ? { preset } : {}),
      };
      await deps.audit.record(tx, {
        ...principalActor(principal),
        action: 'key.created',
        targetType: 'key',
        targetId: key.id,
        changes,
        requestId,
      });
      await deps.events.publish(tx, {
        type: 'key.created',
        subjectType: 'key',
        subjectId: key.id,
        payload: changes,
      });
      return { ...apiKeyMetadata(key), token: material.credential };
    },
    async revoke(tx: TenantTransaction, id: string, requestId?: string): Promise<void> {
      const principal = managementSession(tx);
      const key = await tx.repositories.keys.get(id, { lock: true });
      if (key.revokedAt) return;
      await tx.repositories.keys.revoke(id, deps.clock.now());
      await deps.audit.record(tx, {
        ...principalActor(principal),
        action: 'key.revoked',
        targetType: 'key',
        targetId: id,
        changes: { changedFields: ['revokedAt'] },
        requestId,
      });
      await deps.events.publish(tx, {
        type: 'key.revoked',
        subjectType: 'key',
        subjectId: id,
        payload: { changedFields: ['revokedAt'] },
      });
    },
  };
}
export type KeyService = ReturnType<typeof createKeyService>;
