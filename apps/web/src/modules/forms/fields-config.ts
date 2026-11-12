/**
 * Editable copies of a form's fields. Each field keeps every stored property, so rules this editor
 * doesn't show survive a save; the server's forms schema stays the authority on validity.
 */
export type FieldDraft = {
  /** Local row id; field keys can change while a field is new. */
  id: string;
  /** Saved fields keep their key: renaming would drop the old answers' column (destructive). */
  saved: boolean;
  field: Record<string, unknown>;
};
export type FieldOption = { value: string; label: string };
type Config = Record<string, unknown>;

const record = (value: unknown): Config =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Types the picker offers. `file` needs the uploads module (M3); stored ones stay editable. */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'url',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'consent',
  'hidden',
] as const;

/** Rule inputs per type, beyond label, help and required. */
export const FIELD_RULES: Record<string, readonly string[]> = {
  text: ['minLength', 'maxLength'],
  textarea: ['minLength', 'maxLength'],
  url: ['maxLength'],
  hidden: ['maxLength'],
  number: ['min', 'max'],
  date: ['min', 'max'],
  multiselect: ['min', 'max'],
  email: ['identifiesSubject'],
  consent: ['text', 'version'],
  file: ['zone', 'maxFiles'],
};
export const hasOptions = (type: string) => type === 'select' || type === 'multiselect';

/** Common fields ("templates"), added with sensible defaults. */
export const FIELD_PRESETS = {
  name: { key: 'name', type: 'text', required: true },
  email: { key: 'email', type: 'email', required: true, identifiesSubject: true },
  phone: { key: 'phone', type: 'phone' },
  message: { key: 'message', type: 'textarea', required: true },
  consent: { key: 'privacy', type: 'consent', required: true, version: '1' },
} as const satisfies Record<string, Config>;
export type FieldPreset = keyof typeof FIELD_PRESETS;

const draftId = () => crypto.randomUUID();

export function readDrafts(config: unknown): FieldDraft[] {
  const fields = record(config)['fields'];
  return (Array.isArray(fields) ? fields : []).map((field) => ({
    id: draftId(),
    saved: true,
    field: record(field),
  }));
}

const uniqueKey = (base: string, taken: ReadonlySet<string>) => {
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
};

/** A new field of a type or preset; translated label and defaults (`extra`) come from the caller. */
export function newDraft(
  start: { type: string } | { preset: FieldPreset },
  label: string,
  drafts: readonly FieldDraft[],
  extra: Config = {},
): FieldDraft {
  const base: Config =
    'preset' in start ? { ...FIELD_PRESETS[start.preset] } : { key: start.type, type: start.type };
  const taken = new Set(drafts.map((draft) => text(draft.field['key'])));
  const subject =
    base['identifiesSubject'] === true &&
    drafts.some((draft) => draft.field['identifiesSubject'] === true)
      ? { identifiesSubject: false }
      : {};
  return {
    id: draftId(),
    saved: false,
    field: {
      ...base,
      ...extra,
      ...subject,
      key: uniqueKey(text(base['key']), taken),
      label,
    },
  };
}

/** Sets one property; empty values remove it so the server applies its default. */
export function setProperty(
  draft: FieldDraft,
  name: string,
  value: string | number | boolean | FieldOption[] | undefined,
): FieldDraft {
  const { [name]: _previous, ...rest } = draft.field;
  const empty = value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
  return { ...draft, field: empty ? rest : { ...rest, [name]: value } };
}

export const firstOption = (label: string) => [{ value: 'option_1', label }];

/** Changing the type keeps only what every type shares; per-type rules wouldn't apply. */
export function changeType(draft: FieldDraft, type: string, optionLabel: string): FieldDraft {
  const { key, label, help, required } = draft.field;
  return {
    ...draft,
    field: {
      key,
      label,
      type,
      ...(help === undefined ? {} : { help }),
      ...(typeof required === 'boolean' && type !== 'consent' ? { required } : {}),
      ...(type === 'consent' ? { required: true, version: '1' } : {}),
      ...(hasOptions(type) ? { options: firstOption(optionLabel) } : {}),
    },
  };
}

export function optionsOf(draft: FieldDraft): FieldOption[] {
  const options = draft.field['options'];
  return (Array.isArray(options) ? options : []).map((option) => {
    const value = record(option);
    return { value: text(value['value']), label: text(value['label']) };
  });
}

/** The full config to replace with; list columns drop fields that no longer exist. */
export function writeFields(config: unknown, drafts: readonly FieldDraft[]): Config {
  const { listFields, ...root } = record(config);
  const keys = new Set(drafts.map((draft) => text(draft.field['key'])));
  const listed = Array.isArray(listFields)
    ? listFields.filter((key) => typeof key === 'string' && keys.has(key))
    : [];
  return {
    ...root,
    fields: drafts.map((draft) => draft.field),
    ...(listed.length ? { listFields: listed } : {}),
  };
}

function fieldsByKey(config: unknown) {
  const list = record(config)['fields'];
  return new Map(
    (Array.isArray(list) ? list : []).map((field) => {
      const value = record(field);
      return [text(value['key']), value] as const;
    }),
  );
}

export type FieldChange =
  | { kind: 'removed'; key: string; label: string }
  | { kind: 'typeChanged'; key: string; label: string; from: string; to: string }
  | { kind: 'optionsRemoved'; key: string; label: string; options: string[] };

/**
 * Describes what happens to existing entries, for the confirmation. Whether a change counts as
 * destructive comes from the server's dry run (`PUT /config?dryRun=true`), not from here.
 */
export function describeChanges(before: unknown, after: unknown): FieldChange[] {
  const next = fieldsByKey(after);
  const changes: FieldChange[] = [];
  for (const [key, field] of fieldsByKey(before)) {
    const label = text(field['label']) || key;
    const now = next.get(key);
    if (!now) {
      changes.push({ kind: 'removed', key, label });
      continue;
    }
    const [from, to] = [text(field['type']), text(now['type'])];
    if (from !== to) {
      changes.push({ kind: 'typeChanged', key, label, from, to });
      continue;
    }
    const kept = new Set(optionsOf({ id: '', saved: true, field: now }).map((o) => o.value));
    const removed = optionsOf({ id: '', saved: true, field })
      .filter((option) => !kept.has(option.value))
      .map((option) => option.label || option.value);
    if (removed.length) changes.push({ kind: 'optionsRemoved', key, label, options: removed });
  }
  return changes;
}
