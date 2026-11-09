import { StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { Feedback } from '../../dashboard/feedback.tsx';
import { formsError, useForm, useFormSummary, useFormsScope } from './api.ts';
import { FormSettingsTab } from './settings.tsx';

/** One form: entries first, settings next (Fields and Embed tabs follow in P2.8c). */
export function FormPage({ formKey }: { formKey: string }) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const form = useForm(formKey);
  const summary = useFormSummary(formKey);
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
          <TabsTrigger value="settings">{t('forms.tabs.settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          {summary.data ? (
            <p>
              {t('forms.entries.summary', {
                total: summary.data.total,
                unread: summary.data.unread,
                spam: summary.data.spam,
              })}
            </p>
          ) : (
            <output>{t('common.loading')}</output>
          )}
        </TabsContent>
        <TabsContent value="settings">
          <FormSettingsTab form={form.data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
