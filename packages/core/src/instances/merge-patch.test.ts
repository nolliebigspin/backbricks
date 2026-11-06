import { expect, test } from 'bun:test';

import { mergeConfigPatch } from './merge-patch.ts';

test('merge patches preserve omitted values, remove null members and replace arrays/scalars', () => {
  const original = { title: 'A', nested: { keep: true, remove: 'old' }, fields: ['email'] };
  expect(
    mergeConfigPatch(original, { nested: { remove: null, added: 1 }, fields: ['name'] }),
  ).toEqual({
    title: 'A',
    nested: { keep: true, added: 1 },
    fields: ['name'],
  });
  expect(original).toEqual({
    title: 'A',
    nested: { keep: true, remove: 'old' },
    fields: ['email'],
  });
  expect(mergeConfigPatch(original, null)).toBeNull();
  expect(mergeConfigPatch(['old'], { nested: { remove: null } })).toEqual({ nested: {} });
});

test('merge treats prototype-shaped member names as ordinary JSON data', () => {
  const result = mergeConfigPatch(
    {},
    JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'),
  );
  if (result === null || typeof result !== 'object') throw new Error('Expected merged object');
  expect(Object.hasOwn(result, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf({})).not.toHaveProperty('polluted');
  expect(JSON.stringify(result)).toBe(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  );
});
