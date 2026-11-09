import { Button, EmptyState, StatusBadge } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { ChoiceField, Field, formText } from '../../auth/fields.tsx';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap } from '../../dashboard/feedback.tsx';
import { useOperationalModules } from '../../dashboard/shell.tsx';
import { formsError, useFormSummary, useForms, useFormsScope, type FormInstance } from './api.ts';

export function formPath(projectId: string, key: string) {
  return `/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(key)}`;
}

/** Forms of the project with entry counts; owners and admins start new forms from a template. */
export function FormsInbox() {
  const { t } = useTranslation();
  const { role } = useTenant();
  const scope = useFormsScope();
  const forms = useForms();
  const rows = forms.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('forms.inbox')}</h1>
      {forms.isPending ? (
        <output>{t('common.loading')}</output>
      ) : forms.isError ? (
        <Feedback error={formsError(forms.error)} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('forms.empty.title')} description={t('forms.empty.description')}>
          <a className="underline" href={`/projects/${scope.projectId}/embed`}>
            {t('forms.empty.embed')}
          </a>
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border bg-background">
          {rows.map((form) => (
            <FormRow key={form.id} form={form} />
          ))}
        </ul>
      )}
      {forms.hasNextPage && (
        <Button variant="outline" onClick={() => void forms.fetchNextPage()}>
          {t('common.more')}
        </Button>
      )}
      {canManage(role) && <CreateForm />}
    </div>
  );
}

function FormRow({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const summary = useFormSummary(form.key);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <a className="break-words font-medium underline" href={formPath(scope.projectId, form.key)}>
          {form.name}
        </a>
        <p className="text-sm text-muted-foreground">
          {summary.data
            ? t('forms.counts', { total: summary.data.total, unread: summary.data.unread })
            : t('common.loading')}
        </p>
      </div>
      <StatusBadge tone={form.status === 'active' ? 'positive' : 'neutral'}>
        {t(`forms.status.${form.status}`)}
      </StatusBadge>
    </li>
  );
}

/** Template keys follow `<template>-<language>` (P2.1b); show the current language's set. */
export function templatesFor(
  templates: readonly { key: string; name: string }[],
  language: string,
) {
  const local = templates.filter((template) => template.key.endsWith(`-${language}`));
  return local.length > 0 ? local : templates;
}

function CreateForm() {
  const { t, i18n } = useTranslation();
  const scope = useFormsScope();
  const client = useQueryClient();
  const modules = useOperationalModules();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const templates = templatesFor(
    modules.data?.find((module) => module.type === 'forms')?.templates ?? [],
    i18n.language,
  );
  return (
    <section className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">{t('forms.create.title')}</h2>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const key = formText(data, 'key');
          const template = formText(data, 'template');
          setBusy(true);
          setError('');
          void (async () => {
            try {
              unwrap(
                await admin.POST('/v1/projects/{projectId}/forms', {
                  params: { path: { projectId: scope.projectId } },
                  headers: scope.headers,
                  body: {
                    key,
                    name: formText(data, 'name'),
                    ...(template ? { template } : {}),
                  },
                }),
              );
              await client.invalidateQueries({ queryKey: scope.prefix });
              window.location.assign(formPath(scope.projectId, key));
            } catch (cause) {
              setError(formsError(cause, 'forms.errors.keyTaken'));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <Field label={t('forms.create.name')} name="name" required maxLength={120} />
        <Field
          label={t('forms.create.key')}
          name="key"
          required
          maxLength={63}
          pattern="[a-z0-9][a-z0-9-]*"
        />
        <p className="text-sm text-muted-foreground">{t('common.addressHint')}</p>
        {templates.length > 0 && (
          <ChoiceField label={t('forms.create.template')} name="template">
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </ChoiceField>
        )}
        <Feedback error={error} />
        <Button type="submit" disabled={busy}>
          {t('forms.create.submit')}
        </Button>
      </form>
    </section>
  );
}
