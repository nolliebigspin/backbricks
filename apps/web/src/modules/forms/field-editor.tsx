import { Button, Input, Label, NativeSelect, NativeSelectOption, Textarea } from '@backbricks/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import {
  changeType,
  FIELD_RULES,
  FIELD_TYPES,
  hasOptions,
  optionsOf,
  setProperty,
  type FieldDraft,
} from './fields-config.ts';

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const numberText = (value: unknown) => (typeof value === 'number' ? String(value) : '');

/** Label, short name, type, help, required and the rules of one field's type. */
export function FieldEditor({
  draft,
  typeName,
  onChange,
}: {
  draft: FieldDraft;
  typeName: (type: string) => string;
  onChange: (draft: FieldDraft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const type = text(draft.field['type']);
  const set = (name: string, value: Parameters<typeof setProperty>[2]) =>
    onChange(setProperty(draft, name, value));
  const types: readonly string[] = FIELD_TYPES.some((known) => known === type)
    ? FIELD_TYPES
    : [...FIELD_TYPES, type];
  const numeric = (name: string, kind: 'number' | 'date' = 'number') => (
    <div key={name} className="space-y-2">
      <Label htmlFor={`${id}-${name}`}>{t(`forms.fields.rules.${name}`)}</Label>
      <Input
        id={`${id}-${name}`}
        type={kind}
        value={kind === 'date' ? text(draft.field[name]) : numberText(draft.field[name])}
        onChange={(event) =>
          set(name, kind === 'date' ? event.target.value : event.target.valueAsNumber)
        }
      />
    </div>
  );
  const rule = (name: string) => {
    if (name === 'identifiesSubject')
      return (
        <div key={name} className="flex items-center gap-2 sm:col-span-2">
          <input
            id={`${id}-${name}`}
            type="checkbox"
            checked={draft.field[name] === true}
            onChange={(event) => set(name, event.target.checked)}
          />
          <Label htmlFor={`${id}-${name}`}>{t('forms.fields.rules.identifiesSubject')}</Label>
        </div>
      );
    if (name === 'text')
      return (
        <div key={name} className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-${name}`}>{t('forms.fields.rules.text')}</Label>
          <Textarea
            id={`${id}-${name}`}
            required
            maxLength={2000}
            value={text(draft.field[name])}
            onChange={(event) => set(name, event.target.value)}
          />
        </div>
      );
    if (name === 'version' || name === 'zone')
      return (
        <div key={name} className="space-y-2">
          <Label htmlFor={`${id}-${name}`}>{t(`forms.fields.rules.${name}`)}</Label>
          <Input
            id={`${id}-${name}`}
            required
            maxLength={64}
            value={text(draft.field[name])}
            onChange={(event) => set(name, event.target.value)}
          />
        </div>
      );
    return numeric(name, type === 'date' ? 'date' : 'number');
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${id}-label`}>{t('forms.fields.label')}</Label>
        <Input
          id={`${id}-label`}
          required
          maxLength={200}
          value={text(draft.field['label'])}
          onChange={(event) => set('label', event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-key`}>{t('forms.fields.key')}</Label>
        <Input
          id={`${id}-key`}
          required
          maxLength={64}
          pattern="[a-z][a-z0-9_]*"
          disabled={draft.saved}
          aria-describedby={`${id}-key-hint`}
          value={text(draft.field['key'])}
          onChange={(event) => set('key', event.target.value)}
        />
        <p id={`${id}-key-hint`} className="text-sm text-muted-foreground">
          {t(draft.saved ? 'forms.fields.keyFixed' : 'forms.fields.keyHint')}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-type`}>{t('forms.fields.type')}</Label>
        <NativeSelect
          id={`${id}-type`}
          value={type}
          onChange={(event) =>
            onChange(changeType(draft, event.target.value, t('forms.fields.optionDefault')))
          }
        >
          {types.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {typeName(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-help`}>{t('forms.fields.help')}</Label>
        <Input
          id={`${id}-help`}
          maxLength={500}
          value={text(draft.field['help'])}
          onChange={(event) => set('help', event.target.value)}
        />
      </div>
      {type !== 'consent' && (
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id={`${id}-required`}
            type="checkbox"
            checked={draft.field['required'] === true}
            onChange={(event) => set('required', event.target.checked)}
          />
          <Label htmlFor={`${id}-required`}>{t('forms.fields.required')}</Label>
        </div>
      )}
      {(FIELD_RULES[type] ?? []).map(rule)}
      {hasOptions(type) && <OptionsEditor draft={draft} onChange={onChange} />}
    </div>
  );
}

function OptionsEditor({
  draft,
  onChange,
}: {
  draft: FieldDraft;
  onChange: (draft: FieldDraft) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const options = optionsOf(draft);
  const set = (next: typeof options) => onChange(setProperty(draft, 'options', next));
  return (
    <fieldset className="space-y-3 sm:col-span-2">
      <legend className="font-medium">{t('forms.fields.options')}</legend>
      {options.map((option, index) => (
        // Option values may be edited, so the row position is the stable identity here.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-${index}-label`}>{t('forms.fields.optionLabel')}</Label>
            <Input
              id={`${id}-${index}-label`}
              required
              maxLength={200}
              value={option.label}
              onChange={(event) =>
                set(
                  options.map((o, at) => (at === index ? { ...o, label: event.target.value } : o)),
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-${index}-value`}>{t('forms.fields.optionValue')}</Label>
            <Input
              id={`${id}-${index}-value`}
              required
              maxLength={64}
              pattern="[a-z0-9_\-]+"
              value={option.value}
              onChange={(event) =>
                set(
                  options.map((o, at) => (at === index ? { ...o, value: event.target.value } : o)),
                )
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={options.length === 1}
            onClick={() => set(options.filter((_, at) => at !== index))}
          >
            {t('forms.fields.removeOption', { label: option.label || option.value })}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          set([
            ...options,
            { value: `option_${options.length + 1}`, label: t('forms.fields.optionDefault') },
          ])
        }
      >
        {t('forms.fields.addOption')}
      </Button>
    </fieldset>
  );
}
