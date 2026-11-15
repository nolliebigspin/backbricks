import { expect, test } from 'bun:test';

import { AppError, MODULE_RETENTION_DAYS } from '@backbricks/core';
import * as fc from 'fast-check';

import {
  UPLOAD_FORMATS,
  UPLOAD_LIMITS,
  uploadFilenameSchema,
  uploadStatusSchema,
  uploadsConfigSchema,
  uploadConfigWarnings,
  uploadsModuleConfigSchema,
  uploadsPublicWritePolicy,
  validateUploadDeclaration,
} from './index.ts';

const pdfZone = () => uploadsConfigSchema.parse({ presets: ['pdf'] });
const pdf = { name: 'résumé.PDF', size: 2048, type: 'APPLICATION/PDF' };

function failure(config: ReturnType<typeof pdfZone>, input: unknown) {
  try {
    validateUploadDeclaration(config, input);
    throw new Error('Expected the declaration to be rejected.');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    if (!(error instanceof AppError)) throw error;
    expect(error.code).toBe('validation_failed');
    return error;
  }
}

test('zone defaults protect uploads and reuse the shared retention policy', () => {
  const config = pdfZone();
  expect(config.scanRequired).toBe(true);
  expect(config.retentionDays).toBe(MODULE_RETENTION_DAYS.default);
  expect(config.maxSizeMb).toBe(10);
  expect(uploadsPublicWritePolicy(config)).toMatchObject({
    proofOfWork: true,
    bodyLimitBytes: 4096,
  });
});

test('zone config is strict, bounded and requires distinct nonempty presets', () => {
  for (const patch of [
    { presets: [] },
    { presets: ['pdf', 'pdf'] },
    { presets: ['archives'] },
    { maxSizeMb: 0 },
    { maxSizeMb: 100.1 },
    { maxSizeMb: 101 },
    { retentionDays: 6 },
    { retentionDays: 3651 },
    { limits: { perMinute: 0 } },
    { spam: { proofOfWork: false } },
    { spam: { honeypotField: 'name' } },
    { spam: { honeypotField: 'size' } },
    { spam: { honeypotField: 'type' } },
    { extra: true },
  ]) {
    expect(uploadsConfigSchema.safeParse({ presets: ['pdf'], ...patch }).success).toBe(false);
  }
  for (const retentionDays of [7, 3650, null])
    expect(uploadsConfigSchema.parse({ presets: ['pdf'], retentionDays }).retentionDays).toBe(
      retentionDays,
    );
  expect(uploadsConfigSchema.parse({ presets: ['pdf'], maxSizeMb: 100 }).maxSizeMb).toBe(100);
});

test('a missing scanner requires an explicit unscanned choice', () => {
  const schema = uploadsModuleConfigSchema({ scanner: false });
  const result = schema.safeParse({ presets: ['pdf'] });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['scanRequired'],
        params: { code: 'capability_unavailable' },
      }),
    );
  expect(schema.parse({ presets: ['pdf'], scanRequired: false }).scanRequired).toBe(false);
  expect(
    uploadsModuleConfigSchema({ scanner: true }).parse({ presets: ['pdf'] }).scanRequired,
  ).toBe(true);
});

test('declared MIME and extension must match a format enabled by the zone', () => {
  expect(validateUploadDeclaration(pdfZone(), pdf)).toEqual({ ...pdf, type: 'application/pdf' });
  for (const format of UPLOAD_FORMATS) {
    const zone = uploadsConfigSchema.parse({ presets: [format.preset] });
    for (const extension of format.extensions)
      expect(
        validateUploadDeclaration(zone, {
          name: `document.${extension}`,
          size: 1,
          type: format.mime,
        }).type,
      ).toBe(format.mime);
  }
  expect(
    failure(pdfZone(), { ...pdf, name: 'photo.png', type: 'image/png' }).errors,
  ).toContainEqual(expect.objectContaining({ path: 'type', code: 'invalid_file' }));
  expect(failure(pdfZone(), { ...pdf, name: 'program.exe' }).errors).toContainEqual(
    expect.objectContaining({ path: 'name', code: 'invalid_file' }),
  );
  for (const type of ['image/svg+xml', 'text/html', 'application/zip', 'application/x-msdownload'])
    expect(failure(pdfZone(), { ...pdf, type }).errors).toContainEqual(
      expect.objectContaining({ path: 'type', code: 'invalid_file' }),
    );
});

test('exact size limits accept the boundary and reject excess, fractions and unsafe numbers', () => {
  const zone = pdfZone();
  const max = 10 * 1024 * 1024;
  expect(validateUploadDeclaration(zone, { ...pdf, size: max }).size).toBe(max);
  expect(failure(zone, { ...pdf, size: max + 1 }).errors).toContainEqual(
    expect.objectContaining({ path: 'size', code: 'too_large' }),
  );
  const largest = uploadsConfigSchema.parse({ presets: ['pdf'], maxSizeMb: 100 });
  expect(validateUploadDeclaration(largest, { ...pdf, size: 104_857_600 }).size).toBe(104_857_600);
  expect(UPLOAD_LIMITS.maxSizeMb * UPLOAD_LIMITS.bytesPerMb).toBe(104_857_600);
  for (const size of [0, -1, 0.5, Infinity, NaN, 104_857_601, Number.MAX_SAFE_INTEGER])
    expect(failure(largest, { ...pdf, size }).errors?.length).toBeGreaterThan(0);
});

test('filenames preserve ordinary Unicode but reject paths, controls and ambiguous endings', () => {
  expect(uploadFilenameSchema.parse('履歴書 – José.pdf')).toBe('履歴書 – José.pdf');
  for (const name of [
    '../resume.pdf',
    'C:\\resume.pdf',
    'a/b.pdf',
    'resume.pdf\r\nX-Test: x',
    'resume\u0000.pdf',
    'resume\u0085.pdf',
    'resume\u202e.pdf',
    '\ud800.pdf',
    'resume.pdf ',
    ' resume.pdf',
    'resume.pdf.',
    '.pdf',
    'resume',
    `${'a'.repeat(256)}.pdf`,
  ])
    expect(uploadFilenameSchema.safeParse(name).success).toBe(false);
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.constantFrom('/', '\\', '\u0000', '\n'),
      (text, separator) => {
        expect(uploadFilenameSchema.safeParse(`prefix${separator}${text}.pdf`).success).toBe(false);
      },
    ),
  );
});

test('arbitrary untrusted declarations produce only safe catalog errors', () => {
  fc.assert(
    fc.property(fc.jsonValue(), (input) => {
      try {
        validateUploadDeclaration(pdfZone(), input);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        if (!(error instanceof AppError)) throw error;
        expect(error.code).toBe('validation_failed');
        expect(error.errors?.length).toBeGreaterThan(0);
      }
    }),
  );
  const secret = 'bb_sk_do_not_echo_this_name';
  const error = failure(pdfZone(), { ...pdf, name: `${secret}/file.pdf`, extra: secret });
  expect(JSON.stringify({ detail: error.detail, errors: error.errors })).not.toContain(secret);
});

test('stored upload states are restricted to the lifecycle contract', () => {
  for (const status of [
    'pending',
    'uploaded',
    'scanning',
    'ready',
    'quarantined',
    'rejected',
  ] as const)
    expect(uploadStatusSchema.parse(status)).toBe(status);
  expect(uploadStatusSchema.safeParse('published').success).toBe(false);
});

test('explicit unscanned and unlimited choices produce clear warnings', () => {
  expect(uploadConfigWarnings(pdfZone())).toEqual([]);
  const config = uploadsConfigSchema.parse({
    presets: ['pdf'],
    scanRequired: false,
    retentionDays: null,
  });
  expect(uploadConfigWarnings(config)).toHaveLength(2);
  expect(uploadConfigWarnings(config).join(' ')).toContain('without malware scanning');
  expect(uploadConfigWarnings(config).join(' ')).toContain('without a time limit');
});
