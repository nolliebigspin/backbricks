import { Button, RecordDrawer } from '@backbricks/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Feedback, unwrap } from '../../dashboard/feedback.tsx';
import { uploadsError, useUploadsScope } from './api.ts';
import { FileAccess, FileSize } from './file-access.tsx';

export function FileDrawer({
  id,
  onClose,
  onDelete,
}: {
  id: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const scope = useUploadsScope();
  const file = useQuery({
    queryKey: [...scope.prefix, 'file', id],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/files/{id}', {
          params: { path: { projectId: scope.projectId, id } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
  return (
    <RecordDrawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={file.data?.name ?? t('uploads.title')}
      closeLabel={t('common.close')}
      actions={
        file.data && (
          <Button variant="destructive" onClick={onDelete}>
            {t('forms.entries.delete')}
          </Button>
        )
      }
    >
      {file.isPending && <output>{t('common.loading')}</output>}
      {file.isError && <Feedback error={uploadsError(file.error)} />}
      {file.data && (
        <div className="space-y-5">
          <FileAccess key={file.data.id} file={file.data} />
          <FileSize bytes={file.data.size} />
          <p className="break-all text-sm">{file.data.type}</p>
          <p className="text-sm">
            {file.data.expiresAt
              ? t('forms.entries.expires', {
                  date: new Date(file.data.expiresAt).toLocaleString(i18n.language),
                })
              : t('forms.entries.noExpiry')}
          </p>
          <pre className="whitespace-pre-wrap break-all text-sm">
            {JSON.stringify(file.data.metadata, null, 2)}
          </pre>
        </div>
      )}
    </RecordDrawer>
  );
}
