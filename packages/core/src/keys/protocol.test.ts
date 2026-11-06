import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { API_KEY_PREFIXES } from './constants.ts';
import { API_KEY_TOKEN_LENGTH, scopeNameSchema, secretKeyTokenSchema } from './protocol.ts';

test('credential protocol accepts base62 and rejects injected delimiters at every position', () => {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const token = fc
    .array(fc.constantFrom(...Array.from(characters)), {
      minLength: API_KEY_TOKEN_LENGTH,
      maxLength: API_KEY_TOKEN_LENGTH,
    })
    .map((parts) => parts.join(''));
  fc.assert(
    fc.property(
      token,
      fc.integer({ min: 0, max: API_KEY_TOKEN_LENGTH - 1 }),
      fc.constantFrom('\n', '\r', ' ', '_', '-', 'é'),
      (value, index, delimiter) => {
        expect(secretKeyTokenSchema.safeParse(`${API_KEY_PREFIXES.secret}${value}`).success).toBe(
          true,
        );
        const injected = value.slice(0, index) + delimiter + value.slice(index + 1);
        expect(
          secretKeyTokenSchema.safeParse(`${API_KEY_PREFIXES.secret}${injected}`).success,
        ).toBe(false);
        expect(
          secretKeyTokenSchema.safeParse(`${API_KEY_PREFIXES.publishable}${value}`).success,
        ).toBe(false);
      },
    ),
  );
});

test('scope names are exact and cannot carry secret-shaped values into audit metadata', () => {
  for (const scope of ['integration:read', 'project:write', 'data:read', 'forms:submit']) {
    expect(scopeNameSchema.safeParse(scope).success).toBe(true);
  }
  for (const scope of [
    'config:read\n',
    'config:read\r',
    'CONFIG:read',
    'config.*',
    'config:',
    ' config:read',
    `${API_KEY_PREFIXES.secret}${'a'.repeat(API_KEY_TOKEN_LENGTH)}:read`,
  ]) {
    expect(scopeNameSchema.safeParse(scope).success).toBe(false);
  }
});
