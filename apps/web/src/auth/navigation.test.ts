import { expect, test } from 'bun:test';

import { accountError, safeRedirect } from './navigation.ts';

test('only same-origin local redirects survive', () => {
  const origin = 'https://backbricks.test';
  for (const input of [
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
    null,
  ]) {
    expect(safeRedirect(input, origin)).toBe('/');
  }
  expect(safeRedirect('/accept-invitation?invitationId=abc', origin)).toBe(
    '/accept-invitation?invitationId=abc',
  );
});

test('account failures map codes without returning sensitive server text', () => {
  expect(accountError({ code: 'LAST_OWNER', message: 'secret' })).toBe('auth.errors.lastOwner');
  expect(accountError({ code: 'INVALID_TOKEN' })).toBe('auth.errors.expired');
  expect(accountError(new Error('secret'))).toBe('auth.errors.generic');
});
