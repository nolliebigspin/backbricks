import { projectSchema, projectUpdateSchema, type ProjectRepository } from '@backbricks/core';
import { AppError } from '@backbricks/core';
import { and, desc, eq, getColumns, isNull } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { moduleInstanceRevisions, moduleInstances } from '../schema/instances.ts';
import { events, notificationRules, usageCounters } from '../schema/platform.ts';
import { apiKeys, projects } from '../schema/projects.ts';
import { idempotencyKeys } from '../schema/technical.ts';
import { beforeCursor, requiredRow, uniqueConflict, type RepositoryScope } from './scope.ts';

// The erasure marker is internal; the project model and API never carry it.
const { erasedAt: _erasedAt, ...projectColumns } = getColumns(projects);
/** Children before parents, so composite foreign keys never block a delete. */
const ERASABLE = [
  events,
  idempotencyKeys,
  usageCounters,
  notificationRules,
  apiKeys,
  moduleInstanceRevisions,
  moduleInstances,
] as const;

const projectWriteFailure = uniqueConflict(
  'projects_organization_id_slug_unique',
  'This project slug is already in use.',
);

export function createProjectRepository(
  tx: DbTransaction,
  scope: RepositoryScope,
): ProjectRepository {
  const where = () =>
    scope.where({ organizationId: projects.organizationId, projectId: projects.id });
  return {
    async list(page) {
      const rows = await tx
        .select(projectColumns)
        .from(projects)
        .where(and(where(), isNull(projects.deletedAt), beforeCursor(projects, page)))
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(scope.limit(page));
      return rows.map((row) => projectSchema.parse(row));
    },
    async get(id, options = {}) {
      const query = tx
        .select(projectColumns)
        .from(projects)
        .where(
          and(
            where(),
            eq(projects.id, id),
            options.includeArchived ? undefined : isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      return requiredRow(await (options.lock ? query.for('update') : query), projectSchema);
    },
    async insert(input) {
      scope.assertActive();
      if (scope.context.projectId && scope.context.projectId !== input.id)
        throw new Error('Cannot create a sibling project from a bound project context.');
      return requiredRow(
        await tx
          .insert(projects)
          .values({ ...input, organizationId: scope.context.organizationId })
          .returning(projectColumns)
          .catch(projectWriteFailure),
        projectSchema,
      );
    },
    async update(id, input) {
      return requiredRow(
        await tx
          .update(projects)
          .set(projectUpdateSchema.parse(input))
          .where(and(where(), eq(projects.id, id), isNull(projects.deletedAt)))
          .returning(projectColumns)
          .catch(projectWriteFailure),
        projectSchema,
      );
    },
    async erasedAt(id) {
      const [row] = await tx
        .select({ erasedAt: projects.erasedAt })
        .from(projects)
        .where(and(where(), eq(projects.id, id)))
        .limit(1);
      if (!row) throw new AppError('not_found');
      return row.erasedAt;
    },
    async eraseRecords() {
      const projectId = erasureScope();
      let count = 0;
      for (const table of ERASABLE) {
        // oxlint-disable-next-line no-await-in-loop -- Ordered deletes in the erasure transaction.
        const rows = await tx
          .delete(table)
          .where(
            and(
              eq(table.organizationId, scope.context.organizationId),
              eq(table.projectId, projectId),
            ),
          )
          .returning({ organizationId: table.organizationId });
        count += rows.length;
      }
      return count;
    },
    async tombstone({ slug, now }) {
      const projectId = erasureScope();
      await tx
        .update(projects)
        .set({
          name: 'Erased project',
          slug,
          allowedOrigins: [],
          settings: {},
          updatedAt: now,
          erasedAt: now,
        })
        .where(and(where(), eq(projects.id, projectId)));
    },
  };
  function erasureScope() {
    scope.assertActive();
    const projectId = scope.context.projectId;
    if (!scope.context.archivedProject || !projectId)
      throw new Error('Project erasure runs only in the archived-project worker context.');
    return projectId;
  }
}
