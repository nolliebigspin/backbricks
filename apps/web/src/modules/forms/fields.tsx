import {
  Button,
  FieldListEditor,
  Label,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  TypedConfirmDialog,
} from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap } from '../../dashboard/feedback.tsx';
import { formsError, useFormsScope, type FormInstance } from './api.ts';
import { FieldEditor } from './field-editor.tsx';
import {
  describeChanges,
  firstOption,
  FIELD_PRESETS,
  FIELD_TYPES,
  hasOptions,
  newDraft,
  readDrafts,
  writeFields,
  type FieldChange,
  type FieldDraft,
  type FieldPreset,
} from './fields-config.ts';

const FORMS_RESOURCE = 'forms';
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const stale = () => Object.assign(new Error('stale'), { code: 'conflict' });

/** The fields websites send; read-only for members (§E.4). */
export function FieldsTab({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const { role } = useTenant();
  const manage = canManage(role);
  return (
    <div className="space-y-6">
      {!manage && <p>{t('forms.fields.readOnly')}</p>}
      {/* Remount on a new version so the editor shows what the server stored. */}
      <FieldsForm key={form.configVersion} form={form} disabled={!manage} />
    </div>
  );
}

function FieldsForm({ form, disabled }: { form: FormInstance; disabled: boolean }) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const client = useQueryClient();
  const [drafts, setDrafts] = useState(() => readDrafts(form.config));
  const [pending, setPending] = useState<{
    config: Record<string, unknown>;
    changes: FieldChange[];
  } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const typeName = (type: string) => t(`forms.fields.types.${type}`, { defaultValue: type });
  const update = (next: FieldDraft[]) => {
    setDone(false);
    setDrafts(next);
  };
  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await work();
      } catch (cause) {
        setError(formsError(cause));
      } finally {
        setBusy(false);
      }
    })();
  };
  const path = { projectId: scope.projectId };
  async function save(config: Record<string, unknown>) {
    unwrap(
      await admin.PUT('/v1/projects/{projectId}/forms/{key}', {
        params: { path: { ...path, key: form.key } },
        headers: scope.headers,
        body: { configVersion: form.configVersion, config },
      }),
    );
    setDone(true);
    await client.invalidateQueries({ queryKey: scope.prefix });
  }
  /** The server's dry run decides whether the change loses data (one classifier, D30). */
  async function destructive(config: Record<string, unknown>) {
    const document = unwrap(
      await admin.GET('/v1/projects/{projectId}/config', {
        params: { path },
        headers: scope.headers,
      }),
    );
    const forms = document.modules[FORMS_RESOURCE] ?? {};
    const current = forms[form.key];
    if (current?.configVersion !== form.configVersion) throw stale();
    const plan = unwrap(
      await admin.PUT('/v1/projects/{projectId}/config', {
        params: { path, query: { dryRun: 'true' } },
        headers: scope.headers,
        body: {
          config: {
            ...document,
            modules: { [FORMS_RESOURCE]: { ...forms, [form.key]: { ...current, config } } },
          },
        },
      }),
    );
    return (
      'planHash' in plan &&
      plan.changes.some(
        (change) =>
          change.resource === FORMS_RESOURCE && change.key === form.key && change.destructive,
      )
    );
  }
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const config = writeFields(form.config, drafts);
        run(async () => {
          if (await destructive(config))
            setPending({ config, changes: describeChanges(form.config, config) });
          else await save(config);
        });
      }}
    >
      <p className="text-sm text-muted-foreground">{t('forms.fields.intro')}</p>
      <fieldset className="space-y-6" disabled={disabled || busy}>
        <legend className="sr-only">{t('forms.fields.title')}</legend>
        <FieldListEditor
          items={drafts}
          getId={(draft) => draft.id}
          getName={(draft) => text(draft.field['label']) || text(draft.field['key'])}
          renderSummary={(draft) =>
            [
              typeName(text(draft.field['type'])),
              text(draft.field['key']),
              ...(draft.field['required'] === true ? [t('forms.fields.requiredShort')] : []),
            ].join(' · ')
          }
          renderEditor={(draft, index) => (
            <FieldEditor
              draft={draft}
              typeName={typeName}
              onChange={(next) => update(drafts.map((item, at) => (at === index ? next : item)))}
            />
          )}
          onChange={update}
          disabled={disabled || busy}
          labels={{
            list: t('forms.fields.title'),
            edit: (name) => t('forms.fields.edit', { name }),
            moveUp: (name) => t('forms.fields.moveUp', { name }),
            moveDown: (name) => t('forms.fields.moveDown', { name }),
            remove: (name) => t('forms.fields.remove', { name }),
          }}
          renderAdd={
            disabled
              ? undefined
              : (add) => (
                  <AddField
                    typeName={typeName}
                    onAdd={(start) =>
                      add(
                        newDraft(
                          start,
                          'preset' in start
                            ? t(`forms.fields.presets.${start.preset}`)
                            : typeName(start.type),
                          drafts,
                          'preset' in start
                            ? start.preset === 'consent'
                              ? { text: t('forms.fields.consentDefault') }
                              : {}
                            : hasOptions(start.type)
                              ? { options: firstOption(t('forms.fields.optionDefault')) }
                              : start.type === 'consent'
                                ? {
                                    required: true,
                                    version: '1',
                                    text: t('forms.fields.consentDefault'),
                                  }
                                : {},
                        ),
                      )
                    }
                  />
                )
          }
        />
        {!disabled && (
          <Button type="submit" disabled={busy || drafts.length === 0}>
            {t('common.save')}
          </Button>
        )}
      </fieldset>
      <Feedback error={error} done={done} />
      {error === 'forms.errors.stale' && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void client.invalidateQueries({ queryKey: scope.prefix })}
        >
          {t('forms.errors.reload')}
        </Button>
      )}
      {pending && (
        <TypedConfirmDialog
          title={t('forms.fields.confirmTitle')}
          description={t('forms.fields.confirmDescription')}
          confirmText={form.key}
          typeLabel={t('forms.danger.typeKey', { key: form.key })}
          confirmLabel={t('forms.fields.confirmSave')}
          cancelLabel={t('common.cancel')}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const { config } = pending;
            setPending(null);
            run(() => save(config));
          }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {pending.changes.length === 0 && <li>{t('forms.fields.changes.other')}</li>}
            {pending.changes.map((change) => (
              <li key={`${change.kind}-${change.key}`}>
                {change.kind === 'removed'
                  ? t('forms.fields.changes.removed', { label: change.label })
                  : change.kind === 'typeChanged'
                    ? t('forms.fields.changes.typeChanged', {
                        label: change.label,
                        from: typeName(change.from),
                        to: typeName(change.to),
                      })
                    : t('forms.fields.changes.optionsRemoved', {
                        label: change.label,
                        options: change.options.join(', '),
                      })}
              </li>
            ))}
          </ul>
        </TypedConfirmDialog>
      )}
    </form>
  );
}

type Start = { type: string } | { preset: FieldPreset };

/** Common fields first, then every type; `file` arrives with uploads (M3). */
function AddField({
  typeName,
  onAdd,
}: {
  typeName: (type: string) => string;
  onAdd: (start: Start) => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState('preset:email');
  const id = useId();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor={id}>{t('forms.fields.addLabel')}</Label>
        <NativeSelect id={id} value={choice} onChange={(event) => setChoice(event.target.value)}>
          <NativeSelectOptGroup label={t('forms.fields.common')}>
            {Object.keys(FIELD_PRESETS).map((preset) => (
              <NativeSelectOption key={preset} value={`preset:${preset}`}>
                {t(`forms.fields.presets.${preset}`)}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          <NativeSelectOptGroup label={t('forms.fields.allTypes')}>
            {FIELD_TYPES.map((type) => (
              <NativeSelectOption key={type} value={`type:${type}`}>
                {typeName(type)}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const [kind = '', value = ''] = choice.split(':');
          const preset = Object.keys(FIELD_PRESETS).find((name) => name === value);
          onAdd(kind === 'preset' && isPreset(preset) ? { preset } : { type: value });
        }}
      >
        {t('forms.fields.add')}
      </Button>
    </div>
  );
}

const isPreset = (value: string | undefined): value is FieldPreset =>
  value !== undefined && Object.hasOwn(FIELD_PRESETS, value);
