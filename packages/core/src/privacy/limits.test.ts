import { expect, test } from 'bun:test';

import {
  createSubjectCollection,
  SUBJECT_EXPORT_LIMITS,
  assertSubjectArchiveSize,
} from './limits.ts';

test('subject collections fail explicitly at the record ceiling, including an otherwise tiny final page', () => {
  const collection = createSubjectCollection();
  for (let i = 0; i < SUBJECT_EXPORT_LIMITS.records; i++) collection.add({ id: i });
  expect(() => collection.add({ id: 'overflow' })).toThrow('complete subject export exceeds');
});
test('subject metadata is bounded by UTF-8 bytes while accumulating', () => {
  const collection = createSubjectCollection();
  const value = '€'.repeat(32 * 1024);
  expect(() => {
    for (let i = 0; i < 100; i++) collection.add({ value });
  }).toThrow('complete subject export exceeds');
  expect(collection.values.length).toBeLessThan(100);
});

test('archive ceilings include content, the full manifest and directory overhead', () => {
  expect(() => assertSubjectArchiveSize(11 * 100 * 1024 * 1024, 1024, 11)).toThrow(
    'complete archive exceeds',
  );
  expect(() =>
    assertSubjectArchiveSize(SUBJECT_EXPORT_LIMITS.archiveBytes - 1024, 1024, 1),
  ).toThrow('complete archive exceeds');
  expect(() => assertSubjectArchiveSize(100 * 1024 * 1024, 1024, 1)).not.toThrow();
});
