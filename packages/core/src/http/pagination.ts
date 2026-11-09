/** Shared upper bound for API pages and tenant repository reads. */
export const MAX_PAGE_SIZE = 100;

import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { parseTypeId } from '../ids/type-id.ts';
import type { RepositoryPage } from '../tenancy/repositories.ts';

export const DEFAULT_PAGE_SIZE = 50;
const cursorSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z
      .string()
      .max(128)
      .refine((id) => parseTypeId(id) !== null),
  })
  .strict();
export const pageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();

/** Opaque position only; repositories still apply the authenticated tenant scope. */
export function encodePageCursor(row: { createdAt: Date; id: string }): string {
  return btoa(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Decode bounded, validated positions; cursor values never become SQL fragments. */
export function repositoryPage(query: z.infer<typeof pageQuerySchema>): RepositoryPage {
  if (!query.cursor) return { limit: query.limit, lookAhead: true };
  try {
    const row = cursorSchema.parse(
      JSON.parse(atob(query.cursor.replaceAll('-', '+').replaceAll('_', '/'))),
    );
    return {
      limit: query.limit,
      lookAhead: true,
      before: { createdAt: new Date(row.createdAt), id: row.id },
    };
  } catch {
    throw new AppError('validation_failed', { detail: 'Invalid pagination cursor.' });
  }
}

/** One look-ahead row distinguishes a full last page from a page with more results. */
export function pageResult<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return { data, nextCursor: rows.length > limit && last ? encodePageCursor(last) : null };
}
