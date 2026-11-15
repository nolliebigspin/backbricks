import type { AdminOperations } from '@backbricks/sdk/admin';
import { useTranslation } from 'react-i18next';

import { useUploadsScope } from '../uploads/api.ts';
import { FileAccess, FileSize } from '../uploads/file-access.tsx';

type Entry =
  AdminOperations['forms.submissions.read']['responses'][200]['content']['application/json'];
/** Match only the owner-bound metadata supplied with this entry; absent IDs never trigger a file lookup. */
export function EntryFiles({
  value,
  attachments,
}: {
  value: unknown;
  attachments: Entry['attachments'];
}) {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const ids = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];
  if (!ids.length) return <p>{t('forms.entries.empty')}</p>;
  return (
    <ul className="space-y-3">
      {ids.map((id) => {
        const file = attachments?.find((candidate) => candidate.id === id);
        return (
          <li key={id} className="space-y-3 rounded-md border p-3">
            {file ? (
              <>
                <p className="break-words font-medium">{file.name}</p>
                <FileSize bytes={file.size} />
                <FileAccess
                  key={`${scope.organizationId}/${scope.projectId}/${file.id}`}
                  file={file}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('uploads.missingAttachment')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
