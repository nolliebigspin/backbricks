import { expect, test } from 'bun:test';

import { fileTypeFromBuffer } from 'file-type';

import { UPLOAD_FORMATS } from './formats.ts';
import { inspectOfficePackage } from './office.ts';

const fixture = (name: string) => Bun.file(new URL(`../test/fixtures/${name}`, import.meta.url));
const word = UPLOAD_FORMATS.find(
  (format) =>
    format.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);
if (!word || !('mainPart' in word)) throw new Error('Missing Word format.');

test('strict Office inspection reads the actual supported main subtype from bounded package XML', async () => {
  for (const format of UPLOAD_FORMATS) {
    if (!('mainPart' in format)) continue;
    const file = fixture(`valid.${format.extensions[0]}`);
    // oxlint-disable-next-line no-await-in-loop -- Independent fixture formats must each be checked with their own subtype.
    expect(await inspectOfficePackage(file.stream(), file.size, format.mime, format.mainPart)).toBe(
      true,
    );
    // oxlint-disable-next-line no-await-in-loop -- Compare against the dependency's real detector, not a guessed ZIP MIME.
    expect((await fileTypeFromBuffer(await file.bytes()))?.mime).toBe(format.mime);
  }
});

test('Office ZIP hints, VBA, comment/entity spoofing and oversized metadata never authorize an allowed subtype', async () => {
  for (const name of [
    'missing-content-types.zip',
    'macro.docm',
    'hidden-vba.docx',
    'comment-spoof.docx',
    'entity-spoof.docx',
    'oversized-content-types.docx',
    'valid.xlsx',
  ]) {
    const file = fixture(name);
    // oxlint-disable-next-line no-await-in-loop -- Each malicious/mismatched package is a separate bounded parser invocation.
    expect(await inspectOfficePackage(file.stream(), file.size, word.mime, word.mainPart)).toBe(
      false,
    );
  }
});
