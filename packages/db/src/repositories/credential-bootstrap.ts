import { secretKeyReferenceSchema, type SecretKeyLookup } from '@backbricks/core';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import type { Database } from '../client.ts';
import { apiKeys, projects } from '../schema/projects.ts';

/** Privileged auth bootstrap (ADR-0024): an exact hash match yields IDs only, never a general query API. */
export function createSecretKeyLookup(db: Database): SecretKeyLookup {
  return async (hash, now) => {
    if (hash.byteLength !== 32) return null;
    const rows = await db
      .select({
        id: apiKeys.id,
        organizationId: apiKeys.organizationId,
        projectId: apiKeys.projectId,
      })
      .from(apiKeys)
      .innerJoin(
        projects,
        and(
          eq(projects.id, apiKeys.projectId),
          eq(projects.organizationId, apiKeys.organizationId),
        ),
      )
      .where(
        and(
          eq(apiKeys.lookupHash, Buffer.from(hash)),
          eq(apiKeys.kind, 'secret'),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ? secretKeyReferenceSchema.parse(rows[0]) : null;
  };
}
