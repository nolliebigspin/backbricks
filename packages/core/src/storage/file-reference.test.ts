import { expect, test } from 'bun:test';

import { createIds } from '../ids/type-id.ts';
import { redactFields, redactSecretText } from '../logging/redact.ts';
import { systemClock } from '../time/clock.ts';
import { fileReferenceSchema, parseFileReference, uploadTokenSchema } from './file-reference.ts';

test('file references bind a canonical file ID to exactly 256 bits of bearer material', () => {
  const id = createIds(systemClock).generate('file');
  const token = `bbu_${'a'.repeat(64)}`;
  const reference = `${id}.${token}`;
  expect(uploadTokenSchema.safeParse(token).success).toBe(true);
  expect(fileReferenceSchema.safeParse(reference).success).toBe(true);
  expect(parseFileReference(reference)).toEqual({ fileId: id, uploadToken: token });
  for (const invalid of [
    id,
    token,
    `${reference}.extra`,
    reference.replace('file_', 'sub_'),
    `${id}.bbu_short`,
    `${id}.bbu_${'A'.repeat(64)}`,
    'x'.repeat(10000),
  ]) {
    expect(parseFileReference(invalid)).toBeNull();
  }
  expect(redactSecretText(`failure ${reference}`)).toBe(`failure ${id}.[redacted]`);
  expect(
    redactFields({
      fileRef: reference,
      uploadToken: token,
      uploadUrl: 'https://signed.invalid/private',
    }),
  ).toEqual({ fileRef: '[redacted]', uploadToken: '[redacted]', uploadUrl: '[redacted]' });
});
