import { expect, test } from 'bun:test';

import { formatBytes } from './format-bytes.ts';
test('capacity formatting preserves large integer precision and localized fractions', () => {
  expect(formatBytes(0n, 'en')).toBe('0 B');
  expect(formatBytes(1536n, 'en')).toBe('1.5 KiB');
  expect(formatBytes(1536n, 'de')).toBe('1,5 KiB');
  expect(formatBytes(9223372036854775807n, 'en')).toBe('7.9 EiB');
  expect(() => formatBytes(-1n, 'en')).toThrow(RangeError);
});
