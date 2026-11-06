import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { allowedOriginsSchema, httpOriginSchema, isOriginAllowed } from '../index.ts';

test('origins normalize browser-equivalent scheme, host and default ports with exact matching', () => {
  expect(allowedOriginsSchema.parse(['HTTPS://EXAMPLE.COM:443/', 'https://example.com'])).toEqual([
    'https://example.com',
  ]);
  expect(httpOriginSchema.parse('http://[::1]:8080')).toBe('http://[::1]:8080');
  expect(httpOriginSchema.parse('https://bücher.example')).toBe('https://xn--bcher-kva.example');
  const allowed = ['https://example.com'];
  expect(isOriginAllowed(allowed, 'https://example.com:443')).toBe(true);
  for (const value of [
    'https://example.com.evil.test',
    'https://evil-example.com',
    'http://example.com',
    'https://example.com:444',
  ])
    expect(isOriginAllowed(allowed, value)).toBe(false);
  expect(isOriginAllowed([], 'https://any.example')).toBe(true);
  expect(isOriginAllowed([], 'null')).toBe(false);
});

test('origins reject credentials, paths, query, fragments, wildcards and URL parser repairs', () => {
  for (const value of [
    '*',
    'https://*.example.com',
    'https://user:pass@example.com',
    'https://@example.com',
    'https://example.com/path',
    'https://example.com/.',
    'https://example.com?',
    'https://example.com#',
    'https://example.com\\evil',
    ' https://example.com',
    'https://example.com\n',
    'https:example.com',
    'ftp://example.com',
    'data:text/plain,hello',
    'https://example.com:99999',
  ])
    expect(httpOriginSchema.safeParse(value).success).toBe(false);
  expect(
    allowedOriginsSchema.safeParse(Array.from({ length: 101 }, () => 'https://a.example')).success,
  ).toBe(false);
});

test('origin normalization is idempotent and an allowed host never grants suffix hosts', () => {
  fc.assert(
    fc.property(fc.domain(), (host) => {
      const normalized = httpOriginSchema.parse(`https://${host}`);
      expect(httpOriginSchema.parse(normalized)).toBe(normalized);
      expect(isOriginAllowed([normalized], `https://${host}.evil.test`)).toBe(false);
    }),
  );
});
