import {
  AppError,
  projectSchema,
  projectUpdateSchema,
  type ProjectRepository,
} from '@backbricks/core';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { z } from 'zod';

import type { DbTransaction } from '../client.ts';
import { projects } from '../schema/projects.ts';
import { beforeCursor, requiredRow, type RepositoryScope } from './scope.ts';

const duplicateSlug = z.object({
  code: z.literal('23505'),
  constraint: z.literal('projects_organization_id_slug_unique'),
});
function projectWriteFailure(error: unknown): never {
  if (error instanceof DrizzleQueryError && duplicateSlug.safeParse(error.cause).success)
    throw new AppError('conflict', { detail: 'This project slug is already in use.' });
  throw error;
}

export function createProjectRepository(
  tx: DbTransaction,
  scope: RepositoryScope,
): ProjectRepository {
  const where = () =>
    scope.where({ organizationId: projects.organizationId, projectId: projects.id });
  return {
    async list(page) {
      const rows = await tx
        .select()
        .from(projects)
        .where(and(where(), isNull(projects.deletedAt), beforeCursor(projects, page)))
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(scope.limit(page));
      return rows.map((row) => projectSchema.parse(row));
    },
    async get(id, options = {}) {
      const query = tx
        .select()
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
          .returning()
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
          .returning()
          .catch(projectWriteFailure),
        projectSchema,
      );
    },
  };
}
