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
const pageCursorTokenSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);
export const pageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: pageCursorTokenSchema.optional(),
  })
  .strict();

/** Encode a JSON ordering position for a route-specific schema. */
export function encodePagePosition(position: Readonly<Record<string, string | number>>): string {
  return btoa(JSON.stringify(position))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** Decode a bounded token and validate its ordering tuple before any repository query. */
export function decodePagePosition<S extends z.ZodType>(token: string, schema: S): z.output<S> {
  try {
    pageCursorTokenSchema.parse(token);
    return schema.parse(JSON.parse(atob(token.replaceAll('-', '+').replaceAll('_', '/'))));
  } catch {
    throw new AppError('validation_failed', { detail: 'Invalid pagination cursor.' });
  }
}

/** Opaque position only; repositories still apply the authenticated tenant scope. */
export function encodePageCursor(row: { createdAt: Date; id: string }): string {
  return encodePagePosition({ createdAt: row.createdAt.toISOString(), id: row.id });
}

/** Decode bounded, validated positions; cursor values never become SQL fragments. */
export function repositoryPage(query: z.infer<typeof pageQuerySchema>): RepositoryPage {
  if (!query.cursor) return { limit: query.limit, lookAhead: true };
  const row = decodePagePosition(query.cursor, cursorSchema);
  return {
    limit: query.limit,
    lookAhead: true,
    before: { createdAt: new Date(row.createdAt), id: row.id },
  };
}

/** One look-ahead row distinguishes a full last page from a page with more results. */
export function pageResult<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return { data, nextCursor: rows.length > limit && last ? encodePageCursor(last) : null };
}
