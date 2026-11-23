import { expect, test } from 'bun:test';

import { createClient } from './index.ts';

test('retries a transient read once and handles an empty response', async () => {
  let calls = 0;
  const sdk = createClient({
    baseUrl: 'https://fixture.invalid',
    secretKey: 'bb_sk_fixture',
    async fetch(url, request) {
      expect(url).toBe('https://fixture.invalid/v1/items');
      expect(request.redirect).toBe('error');
      expect(new Headers(request.headers).get('authorization')).toBe('Bearer bb_sk_fixture');
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 503, headers: { 'Retry-After': '0' } })
        : new Response(null, { status: 304 });
    },
  });
  expect(await sdk.request('/items')).toBeUndefined();
  expect(calls).toBe(2);
});

test('does not retry writes or send credentials for paths outside the API', async () => {
  let calls = 0;
  const sdk = createClient({
    baseUrl: 'https://fixture.invalid',
    secretKey: 'bb_sk_fixture',
    async fetch() {
      calls += 1;
      return new Response(null, { status: 503 });
    },
  });
  expect(
    await sdk
      .request('/items', { method: 'POST', body: { value: 1 } })
      .catch((error: unknown) => error),
  ).toMatchObject({ status: 503 });
  expect(await sdk.request('/%2e%2e/outside').catch((error: unknown) => error)).toMatchObject({
    code: 'invalid_path',
  });
  expect(await sdk.request('//another.invalid').catch((error: unknown) => error)).toMatchObject({
    code: 'invalid_path',
  });
  expect(calls).toBe(1);
});
