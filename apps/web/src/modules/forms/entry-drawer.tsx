import { Button, ConfirmDialog, FieldValue, RecordDrawer, StatusBadge } from '@backbricks/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { formsError, useFormsScope, type FormInstance } from './api.ts';
import { EntryFiles } from './entry-files.tsx';
import { useFieldLabels } from './field-labels.ts';

/** Details with historical labels; opening an unread entry marks it read. */
export function EntryDrawer({
  form,
  id,
  onClose,
  onChanged,
}: {
  form: FormInstance;
  id: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const scope = useFormsScope();
  const labels = useFieldLabels();
  const action = useAction(formsError);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const path = { projectId: scope.projectId, key: form.key, id };
  const patch = async (body: {
    read?: boolean;
    status?: 'open' | 'done';
    spamVerdict?: 'clean' | 'spam';
  }) => {
    unwrap(
      await admin.PATCH('/v1/projects/{projectId}/forms/{key}/submissions/{id}', {
        params: { path },
        headers: scope.headers,
        body,
      }),
    );
  };
  const entry = useQuery({
    queryKey: [...scope.prefix, form.key, 'entry', id],
    queryFn: async ({ signal }) => {
      const detail = unwrap(
        await admin.GET('/v1/projects/{projectId}/forms/{key}/submissions/{id}', {
          params: { path },
          headers: scope.headers,
          signal,
        }),
      );
      if (!detail.read) {
        await patch({ read: true });
        void onChanged();
      }
      return detail;
    },
  });
  const data = entry.data;
  const additional = Object.entries(data?.additionalData ?? {}).filter(
    ([key]) => !data?.fields.some((field) => field.key === key && field.type === 'file'),
  );
  return (
    <RecordDrawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        data
          ? t('forms.entries.receivedAt', {
              time: new Date(data.createdAt).toLocaleString(i18n.language),
            })
          : t('common.loading')
      }
      closeLabel={t('common.close')}
      actions={
        data && (
          <>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await patch({ status: data.status === 'done' ? 'open' : 'done' });
                  await entry.refetch();
                  await onChanged();
                })
              }
            >
              {t(data.status === 'done' ? 'forms.entries.markOpen' : 'forms.entries.markDone')}
            </Button>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await patch({ spamVerdict: data.spamVerdict === 'spam' ? 'clean' : 'spam' });
                  await onChanged();
                  onClose();
                })
              }
            >
              {t(data.spamVerdict === 'spam' ? 'forms.entries.notSpam' : 'forms.entries.markSpam')}
            </Button>
            <Button
              variant="destructive"
              disabled={action.busy}
              onClick={() => setConfirmDelete(true)}
            >
              {t('forms.entries.delete')}
            </Button>
          </>
        )
      }
    >
      <Feedback error={action.error || (entry.isError ? formsError(entry.error) : '')} />
      {data && (
        <>
          <div className="flex flex-wrap gap-1">
            <StatusBadge tone={data.status === 'done' ? 'neutral' : 'warning'}>
              {t(`forms.entries.statuses.${data.status}`)}
            </StatusBadge>
            {data.spamVerdict !== 'clean' && (
              <StatusBadge tone="danger">
                {t(`forms.entries.verdict.${data.spamVerdict}`)}
              </StatusBadge>
            )}
            {data.isTest && <StatusBadge tone="neutral">{t('forms.entries.test')}</StatusBadge>}
          </div>
          <dl className="space-y-3">
            {data.fields.map((field) => (
              <div key={field.key}>
                <dt className="font-medium">{field.label}</dt>
                <dd>
                  {field.type === 'file' ? (
                    <EntryFiles
                      value={data.data[field.key] ?? data.additionalData[field.key]}
                      attachments={data.attachments}
                    />
                  ) : (
                    <FieldValue
                      value={data.data[field.key]}
                      options={field.options}
                      labels={labels}
                    />
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {additional.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold">{t('forms.entries.additional')}</h3>
              <p className="text-muted-foreground">{t('forms.entries.additionalHint')}</p>
              <dl className="space-y-3">
                {additional.map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-xs">{key}</dt>
                    <dd>
                      <FieldValue value={value} labels={labels} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <p className="text-muted-foreground">
            {data.expiresAt
              ? t('forms.entries.expires', {
                  date: new Date(data.expiresAt).toLocaleDateString(i18n.language),
                })
              : t('forms.entries.noExpiry')}
          </p>
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('forms.entries.deleteOneTitle')}
          description={t('forms.entries.deleteOneDescription')}
          confirmLabel={t('forms.entries.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            action.run(async () => {
              const result = await admin.DELETE(
                '/v1/projects/{projectId}/forms/{key}/submissions/{id}',
                { params: { path }, headers: scope.headers },
              );
              if (result.error) throw result.error;
              await onChanged();
              onClose();
            });
          }}
        />
      )}
    </RecordDrawer>
  );
}
