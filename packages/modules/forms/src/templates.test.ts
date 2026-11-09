import { describe, expect, test } from 'bun:test';

import { assertFieldCapabilities, formsConfigSchema } from './config.ts';
import { defaultFormsConfig, formsTemplates } from './templates.ts';

describe('form templates', () => {
  test('four templates in en and de, all valid', () => {
    const templates = formsTemplates({ files: false });
    expect(Object.keys(templates).toSorted()).toEqual(
      ['contact', 'event-signup', 'job-application', 'quote-request']
        .flatMap((name) => [`${name}-de`, `${name}-en`])
        .toSorted(),
    );
    for (const { config } of Object.values(templates))
      expect(formsConfigSchema.parse(config)).toEqual(config);
    expect(templates['contact-en']?.name).toBe('Contact form');
    expect(templates['contact-de']?.name).toBe('Kontaktformular');
    expect(templates['contact-de']?.config.fields[2]?.label).toBe('Nachricht');
  });

  test('en and de variants have the same fields; only copy differs', () => {
    const templates = formsTemplates({ files: true });
    for (const name of ['contact', 'event-signup', 'job-application', 'quote-request']) {
      const shape = (language: string) =>
        templates[`${name}-${language}`]?.config.fields.map((field) => [field.key, field.type]);
      expect(shape('de')).toEqual(shape('en'));
    }
  });

  test('every template identifies the person by email and asks for consent', () => {
    for (const { config } of Object.values(formsTemplates({ files: false }))) {
      expect(
        config.fields.filter((field) => field.type === 'email' && field.identifiesSubject),
      ).toHaveLength(1);
      expect(config.fields.some((field) => field.type === 'consent')).toBe(true);
    }
  });

  test('the job application degrades to a link without uploads (§C.7)', () => {
    const without = formsTemplates({ files: false })['job-application-en']!.config;
    const withFiles = formsTemplates({ files: true })['job-application-en']!.config;
    expect(without.fields.some((field) => field.type === 'file')).toBe(false);
    expect(without.fields.find((field) => field.key === 'cv_link')?.type).toBe('url');
    expect(() => assertFieldCapabilities(without, { files: false })).not.toThrow();
    expect(withFiles.fields.find((field) => field.key === 'cv')?.type).toBe('file');
    expect(() => assertFieldCapabilities(withFiles, { files: false })).toThrow();
  });

  test('the default config is the English contact template', () => {
    expect(defaultFormsConfig()).toEqual(formsTemplates({ files: false })['contact-en']!.config);
  });
});
