import { expect, test } from 'bun:test';

import { notificationValue } from './notifications.ts';

test('notification values are plain text for every stored answer shape', () => {
  expect(notificationValue('Hello <b>')).toBe('Hello <b>');
  expect(notificationValue(42)).toBe('42');
  expect(notificationValue(true)).toBe('✓');
  expect(notificationValue(false)).toBe('✗');
  expect(notificationValue(null)).toBe('');
  expect(notificationValue(['a', 'b'])).toBe('a, b');
  expect(
    notificationValue({ accepted: true, version: '2', acceptedAt: '2026-11-09T08:00:00.000Z' }),
  ).toBe('✓ (2)');
  expect(notificationValue({ other: 1 })).toBe('{"other":1}');
});
