import { describe, expect, test } from 'bun:test';

import { AppError, publicWritePolicySchema } from '@backbricks/core';
import * as fc from 'fast-check';
import { z } from 'zod';

import {
  assertFieldCapabilities,
  defaultFormsConfig,
  formsConfigSchema,
  formsPublicWritePolicy,
} from './config.ts';
import { FORM_FIELD_TYPES, FORMS_LIMITS } from './constants.ts';

const text = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  type: 'text',
  label: key,
  ...extra,
});
const options = (count: number, label = 'Option') =>
  Array.from({ length: count }, (_, index) => ({ value: `o${index}`, label }));
const form = (fields: unknown[], extra: Record<string, unknown> = {}) => ({ fields, ...extra });

/** Paths of every issue, so each invalid case proves where it fails. */
function issuePaths(input: unknown) {
  const result = formsConfigSchema.safeParse(input);
  if (result.success) throw new Error('Expected an invalid configuration');
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('forms configuration schema', () => {
  test('defaults are the sensible owner defaults (§E.5)', () => {
    const config = defaultFormsConfig();
    expect(config.spam).toEqual({ honeypotField: '_gotcha', proofOfWork: true });
    expect(config.retentionDays).toBe(180);
    expect(config.limits).toEqual({});
    expect(config.fields.map((entry) => entry.key)).toEqual(['name', 'email', 'message']);
    expect(formsConfigSchema.parse(config)).toEqual(config);
  });

  test('the schema has a strict JSON Schema representation', () => {
    for (const io of ['input', 'output'] as const) {
      const schema = z.toJSONSchema(formsConfigSchema, { io });
      expect(schema.additionalProperties).toBe(false);
    }
  });

  test('every field type accepts its minimal shape', () => {
    const minimal: Record<(typeof FORM_FIELD_TYPES)[number], Record<string, unknown>> = {
      text: {},
      textarea: {},
      email: {},
      phone: {},
      number: { min: 0, max: 10 },
      url: {},
      select: { options: options(2) },
      multiselect: { options: options(3), min: 1, max: 2 },
      checkbox: {},
      date: { min: '2026-01-01', max: '2026-12-31' },
      hidden: {},
      consent: { text: 'I agree to the privacy policy.', version: '2026-11' },
      file: { zone: 'cv' },
    };
    const fields = FORM_FIELD_TYPES.map((type) => ({
      key: `f_${type}`,
      type,
      label: type,
      ...minimal[type],
    }));
    const config = formsConfigSchema.parse(form(fields));
    expect(config.fields).toHaveLength(FORM_FIELD_TYPES.length);
    expect(config.fields.find((entry) => entry.type === 'consent')?.required).toBe(true);
  });

  test('invalid combinations fail with field paths', () => {
    expect(issuePaths(form([text('name'), text('name')]))).toEqual(['fields.1.key']);
    expect(issuePaths(form([text('name', { options: options(1) })]))).toEqual(['fields.0']);
    expect(
      issuePaths(
        form([
          { key: 'a', type: 'email', label: 'A', identifiesSubject: true },
          { key: 'b', type: 'email', label: 'B', identifiesSubject: true },
        ]),
      ),
    ).toEqual(['fields']);
    expect(issuePaths(form([{ key: 'n', type: 'number', label: 'N', min: 5, max: 1 }]))).toEqual([
      'fields.0.min',
    ]);
    expect(
      issuePaths(
        form([{ key: 'd', type: 'date', label: 'D', min: '2026-02-01', max: '2026-01-01' }]),
      ),
    ).toEqual(['fields.0.min']);
    expect(issuePaths(form([text('t', { minLength: 10, maxLength: 5 })]))).toEqual([
      'fields.0.minLength',
    ]);
    expect(
      issuePaths(
        form([{ key: 'm', type: 'multiselect', label: 'M', options: options(2), min: 3 }]),
      ),
    ).toEqual(['fields.0.min']);
    expect(
      issuePaths(
        form([{ key: 's', type: 'select', label: 'S', options: [...options(1), ...options(1)] }]),
      ),
    ).toEqual(['fields.0.options']);
    expect(issuePaths(form([{ key: 's', type: 'select', label: 'S' }]))).toEqual([
      'fields.0.options',
    ]);
    expect(issuePaths(form([text('_gotcha')]))).toContain('fields.0.key');
    expect(issuePaths(form([text('name')], { listFields: ['missing'] }))).toEqual(['listFields.0']);
    expect(issuePaths(form([{ key: 'c', type: 'consent', label: 'C', required: false }]))).toEqual(
      expect.arrayContaining(['fields.0.required']),
    );
    expect(issuePaths(form([text('Name')]))).toEqual(['fields.0.key']);
    expect(issuePaths(form([text('name')], { unknown: true }))).toEqual(['']);
  });

  test('regex rules do not exist (I10)', () => {
    expect(issuePaths(form([text('name', { pattern: '^a+$' })]))).toEqual(['fields.0']);
  });

  test('redirects accept only absolute https URLs (local http for development)', () => {
    const valid = ['https://example.com/thanks?from=form', 'http://localhost:4321/thanks'];
    for (const success of valid)
      expect(
        formsConfigSchema.safeParse(form([text('n')], { redirects: { success } })).success,
      ).toBe(true);
    const invalid = [
      'javascript:alert(1)',
      'http://example.com/thanks',
      'https://user:pass@example.com/',
      'https://example.com/#done',
      '/thanks',
      '//example.com/thanks',
      'data:text/html,hi',
      `https://example.com/${'a'.repeat(FORMS_LIMITS.redirectUrlLength)}`,
    ];
    for (const success of invalid)
      expect(issuePaths(form([text('n')], { redirects: { success } }))).toEqual([
        'redirects.success',
      ]);
    expect(
      issuePaths(form([text('n')], { redirects: { error: 'https://example.com/error' } })),
    ).toEqual(['redirects.success']);
  });

  test('hard upper bounds hold', () => {
    const many = Array.from({ length: FORMS_LIMITS.fields + 1 }, (_, index) => text(`f${index}`));
    expect(issuePaths(form(many))).toEqual(['fields']);
    expect(issuePaths(form([]))).toEqual(['fields']);
    expect(
      issuePaths(
        form([
          { key: 's', type: 'select', label: 'S', options: options(FORMS_LIMITS.options + 1) },
        ]),
      ),
    ).toEqual(['fields.0.options']);
    for (const retentionDays of [6, 3651, 30.5])
      expect(issuePaths(form([text('n')], { retentionDays }))).toEqual(['retentionDays']);
    expect(formsConfigSchema.parse(form([text('n')], { retentionDays: null })).retentionDays).toBe(
      null,
    );
    expect(issuePaths(form([text('n', { label: 'x'.repeat(201) })]))).toEqual(['fields.0.label']);
    // Four large selects stay within every per-field bound but exceed the total size.
    const large = Array.from({ length: 4 }, (_, index) => ({
      key: `s${index}`,
      type: 'select',
      label: 'S',
      options: options(FORMS_LIMITS.options, 'x'.repeat(FORMS_LIMITS.labelLength)),
    }));
    expect(issuePaths(form(large))).toEqual(['']);
  });
});

const parsedPolicy = (input: unknown) =>
  publicWritePolicySchema.parse(formsPublicWritePolicy(formsConfigSchema.parse(input)));

describe('public write policy mapping', () => {
  test('proof-of-work on keeps the shared defaults; opting out lowers the per-IP limit (Q13)', () => {
    expect(parsedPolicy(form([text('n')]))).toEqual({
      proofOfWork: true,
      honeypotField: '_gotcha',
      bodyLimitBytes: 64 * 1024,
      perMinute: 10,
      perHour: 100,
    });
    expect(parsedPolicy(form([text('n')], { spam: { proofOfWork: false } }))).toMatchObject({
      proofOfWork: false,
      perMinute: 5,
      perHour: 100,
    });
    expect(
      parsedPolicy(
        form([text('n')], {
          spam: { proofOfWork: false, honeypotField: 'website' },
          limits: { perMinute: 20, perHour: 200 },
        }),
      ),
    ).toMatchObject({ honeypotField: 'website', perMinute: 20, perHour: 200 });
  });
});

describe('field capabilities', () => {
  const withFile = formsConfigSchema.parse(
    form([text('name'), { key: 'cv', type: 'file', label: 'CV', zone: 'cv' }]),
  );

  test('file fields are rejected with capability_unavailable while uploads is absent (§C.7)', () => {
    const error = (() => {
      try {
        assertFieldCapabilities(withFile, { files: false });
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: 'capability_unavailable',
      status: 422,
      errors: [{ path: 'fields.1.type', code: 'capability_unavailable' }],
    });
    expect(() => assertFieldCapabilities(withFile, { files: true })).not.toThrow();
    expect(() => assertFieldCapabilities(defaultFormsConfig(), { files: false })).not.toThrow();
  });
});

describe('properties', () => {
  const key = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/).filter((value) => value !== '_gotcha');
  const label = fc.string({ minLength: 1, maxLength: 40 });
  const fieldArbitrary = (fieldKey: string) =>
    fc.oneof(
      fc
        .record({ min: fc.nat(50), span: fc.nat(50) })
        .map(({ min, span }) => text(fieldKey, { minLength: min, maxLength: min + span + 1 })),
      fc.constant({ key: fieldKey, type: 'email', label: fieldKey }),
      fc.tuple(fc.integer(), fc.nat()).map(([min, span]) => ({
        key: fieldKey,
        type: 'number',
        label: fieldKey,
        min,
        max: min + span,
      })),
      fc.integer({ min: 1, max: 10 }).map((count) => ({
        key: fieldKey,
        type: 'select',
        label: fieldKey,
        options: options(count),
      })),
      fc.constant({ key: fieldKey, type: 'checkbox', label: fieldKey, required: true }),
      label.map((consent) => ({
        key: fieldKey,
        type: 'consent',
        label: fieldKey,
        text: consent,
        version: 'v1',
      })),
    );
  const configArbitrary = fc
    .uniqueArray(key, { minLength: 1, maxLength: FORMS_LIMITS.fields })
    .chain((keys) => fc.tuple(...keys.map(fieldArbitrary)))
    .chain((fields) =>
      fc.record({
        fields: fc.constant(fields),
        spam: fc.record({ proofOfWork: fc.boolean() }),
        retentionDays: fc.oneof(fc.constant(null), fc.integer({ min: 7, max: 3650 })),
      }),
    );

  test('generated valid configs parse, re-parse unchanged and survive JSON', () => {
    fc.assert(
      fc.property(configArbitrary, (input) => {
        const config = formsConfigSchema.parse(input);
        expect(formsConfigSchema.parse(config)).toEqual(config);
        expect(formsConfigSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
        expect(config.fields.length).toBeLessThanOrEqual(FORMS_LIMITS.fields);
        expect(new Set(config.fields.map((entry) => entry.key)).size).toBe(config.fields.length);
      }),
      { numRuns: 200 },
    );
  });

  test('arbitrary input never throws; it either parses or reports issues', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const result = formsConfigSchema.safeParse(input);
        if (!result.success) expect(result.error.issues.length).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });
});
