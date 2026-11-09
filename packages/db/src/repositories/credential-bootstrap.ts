import { secretKeyReferenceSchema, type SecretKeyLookup } from '@backbricks/core';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import type { Database } from '../client.ts';
import { apiKeys, projects } from '../schema/projects.ts';

/** Only fixed trusted wrappers may select a credential kind; no caller-supplied discriminator. */
function createKeyLookup(db: Database, kind: 'secret' | 'publishable'): SecretKeyLookup {
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
          eq(apiKeys.kind, kind),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ? secretKeyReferenceSchema.parse(rows[0]) : null;
  };
}

/** Exact active-secret hash/ID bootstrap; every later access must be tenant-scoped (ADR-0034). */
export function createSecretKeyLookup(db: Database): SecretKeyLookup {
  return createKeyLookup(db, 'secret');
}

/** Exact active-publishable hash/ID bootstrap approved by Q11; no metadata or general query access. */
export function createPublishableKeyLookup(db: Database): SecretKeyLookup {
  return createKeyLookup(db, 'publishable');
}
