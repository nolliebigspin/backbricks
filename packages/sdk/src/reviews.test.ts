import { expect, test } from 'bun:test';

import { createClient } from './index.ts';

test('reviews keep the project key and cursor separate and submit using shared transport', async () => {
  const requests: { url: URL; init: RequestInit }[] = [];
  const client = createClient({
    baseUrl: 'https://api.example.test/v1',
    publishableKey: 'bb_pk_fixture',
    fetch: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return Response.json({ data: [], nextCursor: null });
    },
  });
  expect(
    await client.reviews.list('testimonials', { limit: 5, sort: 'rating_asc', cursor: 'abc_123' }),
  ).toEqual({ data: [], nextCursor: null });
  expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
    sort: 'rating_asc',
    limit: '5',
    cursor: 'abc_123',
    key: 'bb_pk_fixture',
  });
  const server = createClient({
    baseUrl: 'https://api.example.test',
    secretKey: 'bb_sk_fixture',
    fetch: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return Response.json({ id: 'rev_fixture' });
    },
  });
  expect(
    await server.reviews.submit(
      'testimonials',
      { rating: 4, authorName: 'Ada' },
      { idempotencyKey: 'receipt' },
    ),
  ).toEqual({ id: 'rev_fixture' });
  expect(requests[1]?.url.pathname).toBe('/v1/public/review-collections/testimonials/reviews');
  expect(requests[1]?.init.headers).toMatchObject({
    Authorization: 'Bearer bb_sk_fixture',
    'Idempotency-Key': 'receipt',
  });
});
