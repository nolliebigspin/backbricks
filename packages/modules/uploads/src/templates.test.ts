import { expect, test } from 'bun:test';

import { z } from 'zod';

import {
  defaultUploadsConfig,
  uploadsConfigSchema,
  uploadsTemplates,
  UPLOADS_MODULE_VERSION,
} from './index.ts';

test('localized images/documents/CV templates share valid protected configurations', () => {
  const templates = uploadsTemplates();
  expect(Object.keys(templates).toSorted()).toEqual([
    'cv-de',
    'cv-en',
    'documents-de',
    'documents-en',
    'images-de',
    'images-en',
  ]);
  for (const key of ['images', 'documents', 'cv']) {
    const en = templates[`${key}-en`];
    const de = templates[`${key}-de`];
    expect(en).toBeDefined();
    expect(de).toBeDefined();
    if (!en || !de) throw new Error('Missing localized template.');
    expect(en.config).toEqual(de.config);
    expect(uploadsConfigSchema.parse(en.config)).toEqual(en.config);
    expect(en?.config.scanRequired).toBe(true);
  }
  expect(templates['cv-en']?.config.presets).toEqual(['pdf']);
  expect(templates['cv-en']?.config.maxSizeMb).toBe(5);
  expect(templates['images-en']?.config).toEqual(defaultUploadsConfig());
  expect(UPLOADS_MODULE_VERSION).toBe(1);
});

test('unscanned templates are explicitly opted into and unmistakably labeled', () => {
  const templates = uploadsTemplates({ includeUnscanned: true });
  expect(Object.keys(templates)).toHaveLength(12);
  for (const [key, template] of Object.entries(templates)) {
    expect(template.config.scanRequired).toBe(!key.includes('-unscanned-'));
    if (key.includes('-unscanned-'))
      expect(template.name).toContain(
        key.endsWith('-en') ? 'without malware scanning' : 'ohne Virenprüfung',
      );
  }
  const first = defaultUploadsConfig();
  first.presets.push('pdf');
  expect(defaultUploadsConfig().presets).toEqual(['images']);
});

test('zone configuration remains representable as strict JSON Schema', () => {
  const schema = z.toJSONSchema(uploadsConfigSchema);
  expect(schema.type).toBe('object');
  expect(schema.additionalProperties).toBe(false);
  expect(uploadsConfigSchema.parse(JSON.parse(JSON.stringify(defaultUploadsConfig())))).toEqual(
    defaultUploadsConfig(),
  );
});
