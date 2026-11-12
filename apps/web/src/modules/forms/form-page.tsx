import { StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { Feedback } from '../../dashboard/feedback.tsx';
import { formsError, useForm, useFormSummary, useFormsScope } from './api.ts';
import { EmbedTab } from './embed.tsx';
import { EntriesTab } from './entries.tsx';
import { FieldsTab } from './fields.tsx';
import { FormSettingsTab } from './settings.tsx';

/**
 * One form: entries first, then fields, settings and embed code. `?entry=` opens
 * that entry, the link notification mails use (ADR-0060).
 */
export function FormPage({ formKey }: { formKey: string }) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const form = useForm(formKey);
  const summary = useFormSummary(formKey);
  const initialEntry = new URLSearchParams(window.location.search).get('entry');
  if (form.isPending) return <output>{t('common.loading')}</output>;
  if (form.isError) return <Feedback error={formsError(form.error)} />;
  return (
    <div className="space-y-6">
      <a
        className="text-sm underline"
        href={`/projects/${encodeURIComponent(scope.projectId)}/forms`}
      >
        {t('forms.back')}
      </a>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="break-words text-2xl font-semibold">{form.data.name}</h1>
        <StatusBadge tone={form.data.status === 'active' ? 'positive' : 'neutral'}>
          {t(`forms.status.${form.data.status}`)}
        </StatusBadge>
      </div>
      <Tabs defaultValue="entries">
        <TabsList aria-label={t('forms.tabs.label')}>
          <TabsTrigger value="entries">{t('forms.tabs.entries')}</TabsTrigger>
          <TabsTrigger value="fields">{t('forms.tabs.fields')}</TabsTrigger>
          <TabsTrigger value="settings">{t('forms.tabs.settings')}</TabsTrigger>
          <TabsTrigger value="embed">{t('forms.tabs.embed')}</TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          {summary.data && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t('forms.entries.summary', {
                total: summary.data.total,
                unread: summary.data.unread,
                spam: summary.data.spam,
              })}
            </p>
          )}
          <EntriesTab form={form.data} initialEntry={initialEntry} />
        </TabsContent>
        <TabsContent value="fields">
          <FieldsTab form={form.data} />
        </TabsContent>
        <TabsContent value="settings">
          <FormSettingsTab form={form.data} />
        </TabsContent>
        <TabsContent value="embed">
          <EmbedTab form={form.data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
