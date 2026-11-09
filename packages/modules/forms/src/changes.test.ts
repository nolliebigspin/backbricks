import { describe, expect, test } from 'bun:test';

import { classifyFormsChange } from './changes.ts';
import { formsConfigSchema, type FormsConfig } from './config.ts';

const base = formsConfigSchema.parse({
  fields: [
    { key: 'name', type: 'text', label: 'Name', required: true, minLength: 2, maxLength: 200 },
    { key: 'email', type: 'email', label: 'Email', required: true, identifiesSubject: true },
    { key: 'age', type: 'number', label: 'Age', min: 18, max: 99 },
    { key: 'start', type: 'date', label: 'Start', min: '2026-01-01' },
    {
      key: 'topic',
      type: 'select',
      label: 'Topic',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    },
    {
      key: 'extras',
      type: 'multiselect',
      label: 'Extras',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
      ],
      max: 2,
    },
    { key: 'cv', type: 'file', label: 'CV', zone: 'cv', maxFiles: 2 },
    { key: 'privacy', type: 'consent', label: 'Privacy', text: 'I agree.', version: '1' },
  ],
});

/** Apply an edit to a copy of the base config and classify the change. */
function change(edit: (config: FormsConfig) => void) {
  const next = structuredClone(base);
  edit(next);
  return classifyFormsChange(base, formsConfigSchema.parse(next));
}
const field = (config: FormsConfig, key: string) => {
  const entry = config.fields.find((item) => item.key === key);
  if (!entry) throw new Error(`Missing fixture field ${key}`);
  return entry;
};
const set = (config: FormsConfig, key: string, property: string, value: unknown) => {
  Reflect.set(field(config, key), property, value);
};

describe('forms change classifier', () => {
  // [description, edit, destructive, changed path, expects a warning]
  const cases: [string, (config: FormsConfig) => void, boolean, string, boolean][] = [
    [
      'remove a field',
      (c) => (c.fields = c.fields.filter((f) => f.key !== 'age')),
      true,
      'fields.age',
      false,
    ],
    [
      'change a field type',
      (c) => {
        c.fields[0] = {
          key: 'name',
          type: 'textarea',
          label: 'Name',
          required: true,
          maxLength: 200,
        };
      },
      true,
      'fields.name.type',
      false,
    ],
    ['rename a field key', (c) => set(c, 'age', 'key', 'years'), true, 'fields.age', false],
    [
      'remove a select option',
      (c) => set(c, 'topic', 'options', [{ value: 'a', label: 'A' }]),
      true,
      'fields.topic.options',
      false,
    ],
    ['change a file zone', (c) => set(c, 'cv', 'zone', 'other'), true, 'fields.cv.zone', false],
    [
      'change a label',
      (c) => set(c, 'name', 'label', 'Full name'),
      false,
      'fields.name.label',
      false,
    ],
    [
      'add help text',
      (c) => set(c, 'name', 'help', 'As on your ID'),
      false,
      'fields.name.help',
      false,
    ],
    [
      'add an option',
      (c) =>
        set(c, 'topic', 'options', [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ]),
      false,
      'fields.topic.options',
      false,
    ],
    [
      'relabel an option',
      (c) =>
        set(c, 'topic', 'options', [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'B' },
        ]),
      false,
      'fields.topic.options',
      false,
    ],
    [
      'add an optional field',
      (c) =>
        c.fields.push({
          key: 'notes',
          type: 'textarea',
          label: 'Notes',
          required: false,
          maxLength: 500,
        }),
      false,
      'fields.notes',
      false,
    ],
    [
      'add a required field',
      (c) =>
        c.fields.push({
          key: 'notes',
          type: 'textarea',
          label: 'Notes',
          required: true,
          maxLength: 500,
        }),
      false,
      'fields.notes',
      true,
    ],
    ['reorder fields', (c) => (c.fields = c.fields.toReversed()), false, 'fields', false],
    [
      'make a field required',
      (c) => set(c, 'age', 'required', true),
      false,
      'fields.age.required',
      true,
    ],
    [
      'make a field optional',
      (c) => set(c, 'name', 'required', false),
      false,
      'fields.name.required',
      false,
    ],
    [
      'lower maxLength',
      (c) => set(c, 'name', 'maxLength', 100),
      false,
      'fields.name.maxLength',
      true,
    ],
    [
      'raise maxLength',
      (c) => set(c, 'name', 'maxLength', 300),
      false,
      'fields.name.maxLength',
      false,
    ],
    [
      'raise minLength',
      (c) => set(c, 'name', 'minLength', 3),
      false,
      'fields.name.minLength',
      true,
    ],
    [
      'lower minLength',
      (c) => set(c, 'name', 'minLength', 1),
      false,
      'fields.name.minLength',
      false,
    ],
    ['raise number min', (c) => set(c, 'age', 'min', 21), false, 'fields.age.min', true],
    ['lower number max', (c) => set(c, 'age', 'max', 65), false, 'fields.age.max', true],
    ['widen number max', (c) => set(c, 'age', 'max', 120), false, 'fields.age.max', false],
    [
      'move a date min later',
      (c) => set(c, 'start', 'min', '2026-06-01'),
      false,
      'fields.start.min',
      true,
    ],
    [
      'add a date max',
      (c) => set(c, 'start', 'max', '2026-12-31'),
      false,
      'fields.start.max',
      true,
    ],
    [
      'lower a multiselect max',
      (c) => set(c, 'extras', 'max', 1),
      false,
      'fields.extras.max',
      true,
    ],
    ['lower maxFiles', (c) => set(c, 'cv', 'maxFiles', 1), false, 'fields.cv.maxFiles', true],
    [
      'change the subject field',
      (c) => set(c, 'email', 'identifiesSubject', false),
      false,
      'fields.email.identifiesSubject',
      true,
    ],
    [
      'change consent text and version',
      (c) => {
        set(c, 'privacy', 'text', 'I agree to the new policy.');
        set(c, 'privacy', 'version', '2');
      },
      false,
      'fields.privacy.version',
      false,
    ],
    ['set list fields', (c) => (c.listFields = ['name']), false, 'listFields', false],
    ['change limits', (c) => (c.limits = { perMinute: 20 }), false, 'limits', false],
    [
      'set redirects',
      (c) => (c.redirects = { success: 'https://example.com/thanks' }),
      false,
      'redirects',
      false,
    ],
    [
      'switch proof-of-work off',
      (c) => (c.spam.proofOfWork = false),
      false,
      'spam.proofOfWork',
      true,
    ],
    [
      'rename the honeypot',
      (c) => (c.spam.honeypotField = 'website'),
      false,
      'spam.honeypotField',
      true,
    ],
    ['shorten retention', (c) => (c.retentionDays = 30), false, 'retentionDays', true],
    ['extend retention', (c) => (c.retentionDays = 365), false, 'retentionDays', false],
    ['unlimited retention', (c) => (c.retentionDays = null), false, 'retentionDays', true],
  ];

  for (const [description, edit, destructive, path, warns] of cases)
    test(description, () => {
      const report = change(edit);
      expect(report.destructive).toBe(destructive);
      expect(report.changedPaths).toContain(path);
      expect(report.warnings.length > 0).toBe(warns);
    });

  test('no change reports nothing', () => {
    expect(classifyFormsChange(base, structuredClone(base))).toEqual({
      destructive: false,
      changedPaths: [],
      warnings: [],
    });
  });

  test('an unknown field property is destructive (unclassified changes stay destructive)', () => {
    const next = structuredClone(base);
    Reflect.set(field(next, 'name'), 'futureRule', true);
    expect(classifyFormsChange(base, next)).toMatchObject({
      destructive: true,
      changedPaths: ['fields.name.futureRule'],
    });
    const top = structuredClone(base);
    Reflect.set(top, 'futureSetting', 1);
    expect(classifyFormsChange(base, top).destructive).toBe(true);
  });

  test('a form with an email field but no subject gets a privacy warning', () => {
    const report = change((c) => set(c, 'email', 'identifiesSubject', false));
    expect(report.warnings.some((warning) => warning.includes('privacy requests'))).toBe(true);
  });

  test('one destructive edit makes the whole change destructive', () => {
    const report = change((c) => {
      set(c, 'name', 'label', 'Full name');
      c.fields = c.fields.filter((f) => f.key !== 'age');
    });
    expect(report.destructive).toBe(true);
    expect(report.changedPaths).toEqual(
      expect.arrayContaining(['fields.name.label', 'fields.age']),
    );
  });
});
