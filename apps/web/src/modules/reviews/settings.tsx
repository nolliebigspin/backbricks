import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  RetentionPicker,
  Textarea,
  TypedConfirmDialog,
} from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Field, formText } from '../../auth/fields.tsx';
import { instanceConfigIsDestructive } from '../../dashboard/config-plan.ts';
import { configObject } from '../../dashboard/config-values.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { useReviewsScope, type ReviewCollection } from './api.ts';

type ExtraField = { key: string; label: string; public: boolean; required: boolean };

const inputValue = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? value : '';

function initialFields(value: unknown): ExtraField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const field = configObject(item);
    return typeof field['key'] === 'string' && typeof field['label'] === 'string'
      ? [
          {
            key: field['key'],
            label: field['label'],
            public: field['public'] === true,
            required: field['required'] === true,
          },
        ]
      : [];
  });
}

export function ReviewSettings({ collection }: { collection: ReviewCollection }) {
  const { t } = useTranslation();
  const { role } = useTenant();
  const scope = useReviewsScope();
  const client = useQueryClient();
  const action = useAction();
  const config = configObject(collection.config);
  const [retention, setRetention] = useState(
    typeof config['retentionDays'] === 'number' ? config['retentionDays'] : null,
  );
  const [fields, setFields] = useState(() => initialFields(config['fields']));
  const [confirm, setConfirm] = useState<{
    config: Record<string, unknown>;
    name: string;
    status: 'active' | 'paused';
  } | null>(null);
  const manage = canManage(role);
  const updateField = (index: number, changes: Partial<ExtraField>) =>
    setFields(
      fields.map((field, position) => (position === index ? { ...field, ...changes } : field)),
    );
  const save = async (next: NonNullable<typeof confirm>) => {
    unwrap(
      await admin.PUT('/v1/projects/{projectId}/review-collections/{key}', {
        params: { path: { projectId: scope.projectId, key: collection.key } },
        headers: scope.headers,
        body: { ...next, configVersion: collection.configVersion },
      }),
    );
    await client.invalidateQueries({ queryKey: scope.prefix });
  };

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const verificationMethod = formText(data, 'verificationMethod').trim();
        const nextConfig = {
          ...config,
          titleRequired: data.has('titleRequired'),
          bodyRequired: data.has('bodyRequired'),
          emailRequired: data.has('emailRequired'),
          titleMaxLength: Number(formText(data, 'titleMaxLength')),
          bodyMaxLength: Number(formText(data, 'bodyMaxLength')),
          authorDisplay: formText(data, 'authorDisplay'),
          fields,
          retentionDays: retention,
        };
        const draft: Record<string, unknown> = nextConfig;
        if (verificationMethod) draft['verificationMethod'] = verificationMethod;
        else delete draft['verificationMethod'];
        const next = {
          config: draft,
          name: formText(data, 'name'),
          status: formText(data, 'status') === 'paused' ? ('paused' as const) : ('active' as const),
        };
        action.run(async () => {
          if (
            await instanceConfigIsDestructive(
              scope,
              'review-collections',
              collection.key,
              collection.configVersion,
              next.config,
            )
          )
            setConfirm(next);
          else await save(next);
        });
      }}
    >
      {!manage && <p>{t('forms.settings.readOnly')}</p>}
      <fieldset className="flex flex-col gap-4" disabled={!manage || action.busy}>
        <Field
          label={t('common.name')}
          name="name"
          defaultValue={collection.name}
          required
          maxLength={120}
        />
        <label className="grid gap-2">
          {t('forms.entries.status')}
          <NativeSelect name="status" defaultValue={collection.status}>
            <NativeSelectOption value="active">{t('forms.status.active')}</NativeSelectOption>
            <NativeSelectOption value="paused">{t('forms.status.paused')}</NativeSelectOption>
          </NativeSelect>
        </label>
        <p>{t('reviews.fixedScale', { scale: config['ratingScale'] })}</p>
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium">{t('reviews.required.label')}</legend>
          {(['titleRequired', 'bodyRequired', 'emailRequired'] as const).map((name) => (
            <label className="flex items-center gap-2" key={name}>
              <input type="checkbox" name={name} defaultChecked={config[name] === true} />
              {t(`reviews.required.${name}`)}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('reviews.titleLimit')}
            name="titleMaxLength"
            type="number"
            min={1}
            required
            defaultValue={inputValue(config['titleMaxLength'])}
          />
          <Field
            label={t('reviews.bodyLimit')}
            name="bodyMaxLength"
            type="number"
            min={1}
            required
            defaultValue={inputValue(config['bodyMaxLength'])}
          />
        </div>
        <label className="grid gap-2">
          {t('reviews.authorDisplay')}
          <NativeSelect name="authorDisplay" defaultValue={inputValue(config['authorDisplay'])}>
            <NativeSelectOption value="first_name_last_initial">
              {t('reviews.firstName')}
            </NativeSelectOption>
            <NativeSelectOption value="initials">{t('reviews.initials')}</NativeSelectOption>
          </NativeSelect>
        </label>
        <label className="grid gap-2">
          {t('reviews.verificationMethod')}
          <Textarea
            name="verificationMethod"
            defaultValue={
              typeof config['verificationMethod'] === 'string' ? config['verificationMethod'] : ''
            }
          />
        </label>
        <label className="grid gap-2">
          {t('uploads.retention')}
          <RetentionPicker
            value={retention}
            onChange={setRetention}
            dayLabel={(count) => t('forms.settings.days', { count })}
            unlimitedLabel={t('forms.settings.unlimited')}
          />
        </label>
        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">{t('reviews.extraFields')}</legend>
          {fields.map((field, index) => (
            // Fields remain in editor order until saved, including blank or duplicate names.
            // oxlint-disable-next-line react/no-array-index-key
            <fieldset key={index} className="grid gap-2 rounded-md border p-3">
              <label className="grid gap-1">
                {t('common.address')}
                <Input
                  required
                  pattern="[a-z][a-z0-9_]*"
                  value={field.key}
                  onChange={(event) => updateField(index, { key: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                {t('reviews.fieldLabel')}
                <Input
                  required
                  value={field.label}
                  onChange={(event) => updateField(index, { label: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => updateField(index, { required: event.target.checked })}
                />
                {t('reviews.fieldRequired')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.public}
                  onChange={(event) => updateField(index, { public: event.target.checked })}
                />
                {t('reviews.fieldPublic')}
              </label>
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={() => setFields(fields.filter((_, position) => position !== index))}
              >
                {t('reviews.removeField')}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              setFields([...fields, { key: '', label: '', required: false, public: false }])
            }
          >
            {t('reviews.addField')}
          </Button>
        </fieldset>
        {manage && (
          <Button type="submit" className="self-start">
            {t('common.save')}
          </Button>
        )}
      </fieldset>
      <Feedback error={action.error} done={action.done && confirm === null} />
      {confirm && (
        <TypedConfirmDialog
          title={t('reviews.confirmSettings')}
          description={t('reviews.confirmHint')}
          confirmText={collection.key}
          typeLabel={t('forms.danger.typeKey', { key: collection.key })}
          confirmLabel={t('common.save')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const next = confirm;
            setConfirm(null);
            action.run(() => save(next));
          }}
        />
      )}
    </form>
  );
}
