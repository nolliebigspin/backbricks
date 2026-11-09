import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import {
  createIds,
  encodePageCursor,
  pageQuerySchema,
  pageResult,
  repositoryPage,
} from '../index.ts';

const clock = { now: () => new Date('2026-11-06T00:00:00Z') };
const id = createIds(clock).generate('prj');

test('opaque cursors preserve exact ordering positions and look ahead without widening the page', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1_000_000_000_000 }), (time) => {
      const row = { id, createdAt: new Date(time) };
      const page = repositoryPage(
        pageQuerySchema.parse({ limit: '1', cursor: encodePageCursor(row) }),
      );
      expect(page).toEqual({ limit: 1, lookAhead: true, before: row });
      expect(pageResult([row], 1)).toEqual({ data: [row], nextCursor: null });
      expect(pageResult([row, row], 1)).toEqual({ data: [row], nextCursor: encodePageCursor(row) });
    }),
  );
});

test('invalid cursor documents and unbounded or ambiguous page inputs fail safely', () => {
  for (const input of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.1 },
    { cursor: 'x'.repeat(1025) },
    { unknown: true },
  ])
    expect(pageQuerySchema.safeParse(input).success).toBe(false);
  for (const cursor of [
    'abc',
    btoa('{}'),
    btoa(JSON.stringify({ id: 'not-an-id', createdAt: clock.now().toISOString() })),
    btoa(JSON.stringify({ id, createdAt: 'invalid' })),
  ])
    expect(() => repositoryPage({ limit: 1, cursor })).toThrow('Invalid pagination cursor.');
});
