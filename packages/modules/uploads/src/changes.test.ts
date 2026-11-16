import { expect, test } from 'bun:test';

import { classifyUploadsChange, uploadsConfigSchema } from './index.ts';

const initial = () => uploadsConfigSchema.parse({ presets: ['pdf', 'images'] });
test.each([
  ['remove a preset', { presets: ['pdf'] }, true, 'presets'],
  ['add a preset', { presets: ['pdf', 'images', 'office'] }, false, 'presets'],
  ['reorder presets', { presets: ['images', 'pdf'] }, false, 'presets'],
  ['lower size', { maxSizeMb: 5 }, true, 'maxSizeMb'],
  ['raise size', { maxSizeMb: 20 }, false, 'maxSizeMb'],
  ['shorten retention', { retentionDays: 30 }, true, 'retentionDays'],
  ['extend retention', { retentionDays: 365 }, false, 'retentionDays'],
  ['unlimited retention', { retentionDays: null }, false, 'retentionDays'],
  ['allow unscanned', { scanRequired: false }, true, 'scanRequired'],
  ['change honeypot', { spam: { honeypotField: '_trap' } }, false, 'spam.honeypotField'],
  ['change limits', { limits: { perMinute: 5, perHour: 50 } }, false, 'limits'],
] as const)('%s', (_name, patch, destructive, path) => {
  const report = classifyUploadsChange(
    initial(),
    uploadsConfigSchema.parse({ ...initial(), ...patch }),
  );
  expect(report.destructive).toBe(destructive);
  expect(report.changedPaths).toContain(path);
});

test('requiring scanning and restoring finite retention are destructive', () => {
  const previous = uploadsConfigSchema.parse({
    ...initial(),
    scanRequired: false,
    retentionDays: null,
  });
  const report = classifyUploadsChange(previous, initial());
  expect(report.destructive).toBe(true);
  expect(report.changedPaths.toSorted()).toEqual(['retentionDays', 'scanRequired']);
  expect(report.warnings.join(' ')).toContain('Existing ready files');
});

test('reports risky settings and fails closed for new unclassified properties', () => {
  expect(classifyUploadsChange(initial(), initial())).toEqual({
    destructive: false,
    changedPaths: [],
    warnings: [],
  });
  const risky = uploadsConfigSchema.parse({
    ...initial(),
    scanRequired: false,
    retentionDays: null,
  });
  expect(classifyUploadsChange(initial(), risky).warnings.join(' ')).toContain(
    'without malware scanning',
  );
  expect(classifyUploadsChange(initial(), risky).warnings.join(' ')).toContain(
    'without a time limit',
  );
  const future = { ...initial(), futureRule: true };
  expect(classifyUploadsChange(initial(), future).destructive).toBe(true);
});
