import { describe, expect, test } from 'bun:test';

import { AppError, FIELD_ERROR_CODES, type JsonValue } from '@backbricks/core';
import * as fc from 'fast-check';

import { formsConfigSchema, type FormsConfig } from './config.ts';
import { validateSubmission, type SubmissionTransport } from './validator.ts';

const now = new Date('2026-11-09T10:00:00.000Z');
const config = formsConfigSchema.parse({
  fields: [
    { key: 'name', type: 'text', label: 'Name', required: true, minLength: 2, maxLength: 20 },
    { key: 'bio', type: 'textarea', label: 'Bio', maxLength: 50 },
    { key: 'email', type: 'email', label: 'Email', required: true, identifiesSubject: true },
    { key: 'phone', type: 'phone', label: 'Phone' },
    { key: 'age', type: 'number', label: 'Age', min: 18, max: 99 },
    { key: 'site', type: 'url', label: 'Site', maxLength: 40 },
    {
      key: 'size',
      type: 'select',
      label: 'Size',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
      ],
    },
    {
      key: 'extras',
      type: 'multiselect',
      label: 'Extras',
      min: 1,
      max: 2,
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
      ],
    },
    { key: 'newsletter', type: 'checkbox', label: 'Newsletter' },
    { key: 'terms', type: 'checkbox', label: 'Terms', required: true },
    { key: 'start', type: 'date', label: 'Start', min: '2026-01-01', max: '2026-12-31' },
    { key: 'source', type: 'hidden', label: 'Source', maxLength: 10 },
    { key: 'cv', type: 'file', label: 'CV', zone: 'cv', maxFiles: 2 },
    { key: 'privacy', type: 'consent', label: 'Privacy', text: 'I agree.', version: '3' },
  ],
});
const minimal = { name: 'Ada', email: 'ada@example.com', terms: true, privacy: true };

function errorsOf(input: unknown, transport: SubmissionTransport = 'json') {
  try {
    validateSubmission(config, input, { transport, now, formKey: 'contact' });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    expect(error.code).toBe('validation_failed');
    return (error.errors ?? []).map(({ path, code }) => `${path}:${code}`);
  }
  throw new Error('Expected a validation error');
}
const valid = (input: Record<string, unknown>, transport: SubmissionTransport = 'json') =>
  validateSubmission(config, input, { transport, now, formKey: 'contact' });

describe('submission validator', () => {
  test('a minimal valid submission normalizes and finds the subject', () => {
    const result = valid({ ...minimal, name: '  Ada  ', email: ' ADA@Example.COM ' });
    expect(result).toEqual({
      data: {
        name: 'Ada',
        email: 'ada@example.com',
        terms: true,
        privacy: { accepted: true, version: '3', acceptedAt: '2026-11-09T10:00:00.000Z' },
      },
      subjectEmail: 'ada@example.com',
    });
  });

  // [field, accepted JSON value, normalized value]
  const accepted: [string, unknown, JsonValue][] = [
    ['bio', 'line one\r\nline two', 'line one\nline two'],
    ['phone', '+49 (30) 123-456', '+49 (30) 123-456'],
    ['age', 42, 42],
    ['age', 18, 18],
    ['site', 'https://example.com/a', 'https://example.com/a'],
    ['size', 'm', 'm'],
    ['extras', ['c', 'a', 'a'], ['a', 'c']],
    ['newsletter', false, false],
    ['start', '2026-06-30', '2026-06-30'],
    ['source', 'ad', 'ad'],
    ['cv', ['file_01'], ['file_01']],
  ];
  for (const [key, value, normalized] of accepted)
    test(`accepts ${key} = ${JSON.stringify(value)}`, () => {
      expect(valid({ ...minimal, [key]: value }).data[key]).toEqual(normalized);
    });

  // [field, rejected JSON value, code]
  const rejected: [string, unknown, string][] = [
    ['name', 'A', 'too_short'],
    ['name', 'x'.repeat(21), 'too_long'],
    ['name', 42, 'invalid_type'],
    ['bio', 'x'.repeat(51), 'too_long'],
    ['email', 'not-an-email', 'invalid_email'],
    ['email', `${'a'.repeat(320)}@example.com`, 'invalid_email'],
    ['phone', 'call me', 'invalid_phone'],
    ['phone', '+--()', 'invalid_phone'],
    ['age', 17, 'too_small'],
    ['age', 100, 'too_large'],
    ['age', '42', 'invalid_type'],
    ['site', 'javascript:alert(1)', 'invalid_url'],
    ['site', 'https://user:pw@example.com', 'invalid_url'],
    ['site', `https://example.com/${'x'.repeat(40)}`, 'too_long'],
    ['size', 'xl', 'invalid_option'],
    ['extras', ['a', 'b', 'c'], 'too_many_options'],
    ['extras', ['z'], 'invalid_option'],
    ['extras', 'a', 'invalid_type'],
    ['newsletter', 'yes', 'invalid_type'],
    ['start', '2025-12-31', 'too_small'],
    ['start', '2027-01-01', 'too_large'],
    ['start', '2026-02-30', 'invalid_date'],
    ['start', '30.06.2026', 'invalid_date'],
    ['source', 'x'.repeat(11), 'too_long'],
    ['cv', ['../etc/passwd'], 'invalid_file'],
    ['cv', ['f1', 'f2', 'f3'], 'too_many_files'],
    ['privacy', false, 'must_accept'],
    ['privacy', 'yes', 'invalid_type'],
  ];
  for (const [key, value, code] of rejected)
    test(`rejects ${key} = ${JSON.stringify(value).slice(0, 40)} with ${code}`, () => {
      expect(errorsOf({ ...minimal, [key]: value })).toEqual([`${key}:${code}`]);
    });

  test('missing and empty answers', () => {
    expect(errorsOf({})).toEqual([
      'name:required',
      'email:required',
      'terms:required',
      'privacy:must_accept',
    ]);
    expect(errorsOf({ ...minimal, name: '   ' })).toEqual(['name:required']);
    expect(errorsOf({ ...minimal, terms: false })).toEqual(['terms:required']);
    expect(valid({ ...minimal, bio: '', size: null, extras: [], cv: [] }).data).toEqual(
      valid(minimal).data,
    );
  });

  test('unknown fields are rejected and every code comes from the catalog', () => {
    expect(errorsOf({ ...minimal, admin: true })).toEqual(['admin:unknown_field']);
    expect(errorsOf([])).toEqual([':invalid_type']);
    const catalog: readonly string[] = FIELD_ERROR_CODES;
    for (const [, , code] of rejected) expect(catalog).toContain(code);
  });

  test('the problem has a hint to the public schema and never echoes values', () => {
    const secret = 'secret-value-42';
    try {
      validateSubmission(
        config,
        { ...minimal, email: secret, size: secret, unknown_secret: secret },
        { transport: 'json', now, formKey: 'contact' },
      );
      throw new Error('Expected a validation error');
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      expect(error.hint).toBe(
        'Fetch the form schema via GET /v1/public/forms/contact to see all constraints.',
      );
      expect(error.detail).toBe('3 fields are invalid.');
      expect(JSON.stringify([error.message, error.detail, error.hint, error.errors])).not.toContain(
        secret,
      );
    }
  });
});

describe('urlencoded transport', () => {
  test('strings coerce to the same data as JSON values', () => {
    const json = valid({
      ...minimal,
      age: 42,
      extras: ['b', 'a'],
      newsletter: true,
      bio: 'one\ntwo',
    });
    const form = valid(
      {
        name: 'Ada',
        email: 'ada@example.com',
        terms: 'on',
        privacy: 'on',
        age: ' 42 ',
        extras: ['b', 'a'],
        newsletter: 'true',
        bio: 'one\r\ntwo',
      },
      'form',
    );
    expect(form).toEqual(json);
    expect(
      valid({ ...minimal, extras: 'a', terms: 'on', privacy: '1' }, 'form').data['extras'],
    ).toEqual(['a']);
  });

  test('form-only coercions stay strict', () => {
    const form = { ...minimal, terms: 'on', privacy: 'on' };
    expect(errorsOf({ ...form, age: '4 2' }, 'form')).toEqual(['age:invalid_type']);
    expect(errorsOf({ ...form, age: '0x10' }, 'form')).toEqual(['age:invalid_type']);
    expect(errorsOf({ ...form, age: 'Infinity' }, 'form')).toEqual(['age:invalid_type']);
    expect(errorsOf({ ...form, newsletter: 'maybe' }, 'form')).toEqual(['newsletter:invalid_type']);
    expect(errorsOf({ ...form, name: ['Ada', 'Bob'] }, 'form')).toEqual(['name:invalid_type']);
    expect(errorsOf({ ...form, privacy: 'off' }, 'form')).toEqual(['privacy:must_accept']);
    expect(valid({ ...form, age: '' }, 'form').data['age']).toBeUndefined();
  });
});

const toForm = (input: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(input).flatMap(([key, value]): [string, unknown][] => {
      if (typeof value === 'boolean') return value ? [[key, 'on']] : [];
      if (typeof value === 'number') return [[key, String(value)]];
      return [[key, value]];
    }),
  );

const checkSafely = (input: unknown, transport: SubmissionTransport, target: FormsConfig) => {
  try {
    validateSubmission(target, input, { transport, now, formKey: 'contact' });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    expect(error.code).toBe('validation_failed');
  }
};

describe('properties', () => {
  const answers = fc.record(
    {
      name: fc.string({ minLength: 2, maxLength: 20 }).filter((value) => value.trim().length >= 2),
      bio: fc.string({ maxLength: 50 }),
      age: fc.integer({ min: 18, max: 99 }),
      size: fc.constantFrom('s', 'm'),
      extras: fc.subarray(['a', 'b', 'c'], { minLength: 1, maxLength: 2 }),
      newsletter: fc.boolean(),
      start: fc
        .date({ min: new Date('2026-01-01'), max: new Date('2026-12-31'), noInvalidDate: true })
        .map((date) => date.toISOString().slice(0, 10)),
    },
    { requiredKeys: ['name'] },
  );

  test('both transports normalize equivalent answers identically', () => {
    fc.assert(
      fc.property(answers, (extra) => {
        let json: ReturnType<typeof valid>;
        try {
          json = valid({ ...minimal, ...extra });
        } catch {
          return; // Generated text the rules reject is covered by the table tests.
        }
        const form = valid(toForm({ ...minimal, ...extra }), 'form');
        // An unchecked HTML checkbox is absent; JSON can say `false` explicitly.
        const { newsletter, ...rest } = json.data;
        expect({ ...form.data, newsletter: form.data['newsletter'] ?? false }).toEqual({
          ...rest,
          newsletter: newsletter ?? false,
        });
      }),
      { numRuns: 300 },
    );
  });

  test('normalized output re-validates to itself', () => {
    fc.assert(
      fc.property(answers, (extra) => {
        let first;
        try {
          first = valid({ ...minimal, ...extra });
        } catch {
          return;
        }
        const resubmitted = { ...first.data, privacy: true };
        expect(valid(resubmitted).data).toEqual(first.data);
      }),
      { numRuns: 300 },
    );
  });

  test('no input crashes the validator', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => checkSafely(input, 'json', config)),
      { numRuns: 500 },
    );
    const keys = fc.constantFrom(...config.fields.map((field) => field.key), 'other');
    const formValue = fc.oneof(fc.string(), fc.array(fc.string(), { maxLength: 4 }));
    fc.assert(
      fc.property(fc.dictionary(keys, formValue), (input) => checkSafely(input, 'form', config)),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.dictionary(keys, fc.jsonValue()), (input) =>
        checkSafely(input, 'json', config),
      ),
      { numRuns: 500 },
    );
  });
});
