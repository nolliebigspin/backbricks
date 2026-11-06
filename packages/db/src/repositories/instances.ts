import {
  AppError,
  instanceRevisionSchema,
  instanceUpdateSchema,
  moduleInstanceSchema,
  type InstanceRepository,
  type RevisionRepository,
} from '@backbricks/core';
import { and, desc, eq, ne } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { moduleInstanceRevisions, moduleInstances } from '../schema/instances.ts';
import { beforeCursor, requiredRow, uniqueConflict, type RepositoryScope } from './scope.ts';

const instanceWriteFailure = uniqueConflict(
  'module_instances_project_id_module_type_key_unique',
  'This instance key is already in use.',
);

export function createInstanceRepositories(
  tx: DbTransaction,
  scope: RepositoryScope,
): { instances: InstanceRepository; revisions: RevisionRepository } {
  const where = () => {
    scope.project();
    return scope.where(moduleInstances);
  };
  const instances: InstanceRepository = {
    async list(page, moduleType, options = {}) {
      const rows = await tx
        .select()
        .from(moduleInstances)
        .where(
          and(
            where(),
            moduleType ? eq(moduleInstances.moduleType, moduleType) : undefined,
            options.includeArchived === false ? ne(moduleInstances.status, 'archived') : undefined,
            beforeCursor(moduleInstances, page),
          ),
        )
        .orderBy(desc(moduleInstances.createdAt), desc(moduleInstances.id))
        .limit(scope.limit(page));
      return rows.map((row) => moduleInstanceSchema.parse(row));
    },
    async get(id) {
      return requiredRow(
        await tx
          .select()
          .from(moduleInstances)
          .where(and(where(), eq(moduleInstances.id, id)))
          .limit(1),
        moduleInstanceSchema,
      );
    },
    async getByKey(moduleType, key) {
      return requiredRow(
        await tx
          .select()
          .from(moduleInstances)
          .where(
            and(where(), eq(moduleInstances.moduleType, moduleType), eq(moduleInstances.key, key)),
          )
          .limit(1),
        moduleInstanceSchema,
      );
    },
    async insert(input) {
      return requiredRow(
        await tx
          .insert(moduleInstances)
          .values({ ...input, ...scope.project() })
          .returning()
          .catch(instanceWriteFailure),
        moduleInstanceSchema,
      );
    },
    async update(id, expectedVersion, input) {
      await instances.get(id);
      const rows = await tx
        .update(moduleInstances)
        .set(instanceUpdateSchema.parse(input))
        .where(
          and(
            where(),
            eq(moduleInstances.id, id),
            eq(moduleInstances.configVersion, expectedVersion),
          ),
        )
        .returning();
      if (rows.length === 0) throw new AppError('conflict');
      return requiredRow(rows, moduleInstanceSchema);
    },
    async delete(id) {
      requiredRow(
        await tx
          .delete(moduleInstances)
          .where(and(where(), eq(moduleInstances.id, id)))
          .returning(),
        moduleInstanceSchema,
      );
    },
  };
  const revisions: RevisionRepository = {
    async list(instanceId, page) {
      await instances.get(instanceId);
      const rows = await tx
        .select()
        .from(moduleInstanceRevisions)
        .where(
          and(
            scope.where(moduleInstanceRevisions),
            eq(moduleInstanceRevisions.instanceId, instanceId),
            beforeCursor(moduleInstanceRevisions, page),
          ),
        )
        .orderBy(desc(moduleInstanceRevisions.createdAt), desc(moduleInstanceRevisions.id))
        .limit(scope.limit(page));
      return rows.map((row) => instanceRevisionSchema.parse(row));
    },
    async get(instanceId, version) {
      scope.project();
      return requiredRow(
        await tx
          .select()
          .from(moduleInstanceRevisions)
          .where(
            and(
              scope.where(moduleInstanceRevisions),
              eq(moduleInstanceRevisions.instanceId, instanceId),
              eq(moduleInstanceRevisions.configVersion, version),
            ),
          )
          .limit(1),
        instanceRevisionSchema,
      );
    },
    async insert(input) {
      await instances.get(input.instanceId);
      return requiredRow(
        await tx
          .insert(moduleInstanceRevisions)
          .values({ ...input, ...scope.project() })
          .returning(),
        instanceRevisionSchema,
      );
    },
  };
  return { instances, revisions };
}
