import { Button, ConfirmDialog, Input, Label } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { formsError, useFormSummary, useFormsScope, type FormInstance } from './api.ts';

/**
 * Deleting all entries comes before archiving (Q15): archiving keeps entries until their
 * retention ends, so the form tells owners how to clear them first.
 */
export function DangerZone({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const client = useQueryClient();
  const summary = useFormSummary(form.key);
  const action = useAction(formsError);
  const [typed, setTyped] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const confirmId = useId();
  const path = { projectId: scope.projectId, key: form.key };
  return (
    <section className="space-y-4 rounded-lg border border-destructive/40 p-5">
      <h2 className="text-lg font-semibold">{t('forms.danger.title')}</h2>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          action.run(async () => {
            unwrap(
              await admin.POST('/v1/projects/{projectId}/forms/{key}/submissions/delete-all', {
                params: { path },
                headers: scope.headers,
                body: { confirm: typed },
              }),
            );
            setTyped('');
            setDeleted(true);
            await client.invalidateQueries({ queryKey: scope.prefix });
          });
        }}
      >
        <p>{t('forms.danger.deleteAllDescription', { total: summary.data?.total ?? 0 })}</p>
        <div className="max-w-sm space-y-2">
          <Label htmlFor={confirmId}>{t('forms.danger.typeKey', { key: form.key })}</Label>
          <Input
            id={confirmId}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <Button type="submit" variant="destructive" disabled={action.busy || typed !== form.key}>
          {t('forms.danger.deleteAll')}
        </Button>
        {deleted && <output className="block">{t('forms.danger.deleting')}</output>}
      </form>
      <div className="space-y-3 border-t pt-4">
        <p>
          {summary.data?.total
            ? t('forms.danger.archiveWithEntries')
            : t('forms.danger.archiveDescription')}
        </p>
        <Button variant="outline" disabled={action.busy} onClick={() => setArchiving(true)}>
          {t('forms.danger.archive')}
        </Button>
      </div>
      <Feedback error={action.error} />
      {archiving && (
        <ConfirmDialog
          title={t('forms.danger.archiveTitle')}
          description={t('forms.danger.archiveConfirm')}
          confirmLabel={t('forms.danger.archive')}
          cancelLabel={t('common.cancel')}
          onClose={() => setArchiving(false)}
          onConfirm={() => {
            setArchiving(false);
            action.run(async () => {
              const result = await admin.DELETE('/v1/projects/{projectId}/forms/{key}', {
                params: { path, query: { configVersion: form.configVersion } },
                headers: scope.headers,
              });
              if (result.error) throw result.error;
              await client.invalidateQueries({ queryKey: scope.prefix });
              window.location.assign(`/projects/${encodeURIComponent(scope.projectId)}/forms`);
            });
          }}
        />
      )}
    </section>
  );
}
