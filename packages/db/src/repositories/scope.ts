import { AppError, MAX_PAGE_SIZE, type RepositoryPage, type TenantContext } from '@backbricks/core';
import { and, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type TenantTable = { organizationId: AnyPgColumn; projectId?: AnyPgColumn };

export function createRepositoryScope(context: TenantContext, assertActive: () => void) {
  return {
    context,
    assertActive,
    where(table: TenantTable) {
      assertActive();
      return and(
        eq(table.organizationId, context.organizationId),
        context.projectId && table.projectId ? eq(table.projectId, context.projectId) : undefined,
      );
    },
    project() {
      assertActive();
      if (!context.projectId)
        throw new Error('A project-bound repository requires a project context.');
      return { organizationId: context.organizationId, projectId: context.projectId };
    },
    limit(page: RepositoryPage) {
      assertActive();
      if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > MAX_PAGE_SIZE) {
        throw new Error('Repository pages must contain between 1 and 100 records.');
      }
      return page.limit + (page.lookAhead ? 1 : 0);
    },
  };
}
export type RepositoryScope = ReturnType<typeof createRepositoryScope>;

export function beforeCursor(
  table: { createdAt: AnyPgColumn; id: AnyPgColumn },
  page: RepositoryPage,
) {
  return page.before
    ? sql`(${table.createdAt}, ${table.id}) < (${page.before.createdAt}, ${page.before.id})`
    : undefined;
}

export function requiredRow<T>(rows: unknown[], schema: { parse(value: unknown): T }): T {
  if (rows[0] === undefined) throw new AppError('not_found');
  return schema.parse(rows[0]);
}
