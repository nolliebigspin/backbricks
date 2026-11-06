import { apiKeyRecordSchema, type KeyRepository } from '@backbricks/core';
import { and, desc, eq, gt, isNull, lt, or } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { apiKeys } from '../schema/projects.ts';
import { beforeCursor, requiredRow, type RepositoryScope } from './scope.ts';

export function createKeyRepository(tx: DbTransaction, scope: RepositoryScope): KeyRepository {
  const where = () => {
    scope.project();
    return scope.where(apiKeys);
  };
  return {
    async list(page) {
      const rows = await tx
        .select()
        .from(apiKeys)
        .where(and(where(), beforeCursor(apiKeys, page)))
        .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
        .limit(scope.limit(page));
      return rows.map((row) => apiKeyRecordSchema.parse(row));
    },
    async get(id, options = {}) {
      const query = tx
        .select()
        .from(apiKeys)
        .where(and(where(), eq(apiKeys.id, id)))
        .limit(1);
      return requiredRow(await (options.lock ? query.for('update') : query), apiKeyRecordSchema);
    },
    async findByHash(hash, now) {
      const rows = await tx
        .select()
        .from(apiKeys)
        .where(
          and(
            where(),
            eq(apiKeys.lookupHash, Buffer.from(hash)),
            isNull(apiKeys.revokedAt),
            or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
          ),
        )
        .limit(1);
      return rows[0] ? apiKeyRecordSchema.parse(rows[0]) : null;
    },
    async insert(input) {
      return requiredRow(
        await tx
          .insert(apiKeys)
          .values({ ...input, ...scope.project(), lookupHash: Buffer.from(input.lookupHash) })
          .returning(),
        apiKeyRecordSchema,
      );
    },
    async revoke(id, now) {
      requiredRow(
        await tx
          .update(apiKeys)
          .set({ revokedAt: now })
          .where(and(where(), eq(apiKeys.id, id)))
          .returning(),
        apiKeyRecordSchema,
      );
    },
    async touch(id, now, before) {
      await tx
        .update(apiKeys)
        .set({ lastUsedAt: now })
        .where(
          and(
            where(),
            eq(apiKeys.id, id),
            or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, before)),
          ),
        );
    },
  };
}
