import { Button, StatusBadge, formatBytes } from '@backbricks/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { useBrowserTime } from '../../dashboard/use-browser-time.ts';
import { uploadsError, useUploadsScope, type FileItem } from './api.ts';

type Attachment = Pick<
  FileItem,
  'id' | 'name' | 'size' | 'status' | 'scanStatus' | 'previewable' | 'expiresAt'
>;
export function FileStatus({ file }: { file: Pick<Attachment, 'status' | 'scanStatus'> }) {
  const { t } = useTranslation();
  const blocked = file.status === 'quarantined' || file.status === 'rejected';
  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge tone={blocked ? 'danger' : file.status === 'ready' ? 'positive' : 'neutral'}>
        {t(`uploads.status.${file.status}`)}
      </StatusBadge>
      {file.scanStatus === 'not_scanned' && (
        <StatusBadge tone="warning">{t('uploads.unscanned')}</StatusBadge>
      )}
    </div>
  );
}
export function FileSize({ bytes }: { bytes: string | number }) {
  const { i18n } = useTranslation();
  return (
    <data value={String(bytes)} title={new Intl.NumberFormat(i18n.language).format(BigInt(bytes))}>
      {formatBytes(BigInt(bytes), i18n.language)}
    </data>
  );
}
/** Signed URLs stay in this mounted scope, outside Query and persistent browser storage. */
export function FileAccess({ file }: { file: Attachment }) {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const now = useBrowserTime();
  const action = useAction(uploadsError);
  const [preview, setPreview] = useState('');
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function request(previewMode: boolean) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    action.run(async () => {
      const result = unwrap(
        await admin.POST('/v1/projects/{projectId}/files/{id}/download-url', {
          params: { path: { projectId: scope.projectId, id: file.id } },
          headers: scope.headers,
          body: { preview: previewMode },
          signal: active.signal,
        }),
      );
      if (active.signal.aborted) return;
      if (previewMode) {
        setPreview(result.url);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(
          () => setPreview(''),
          Math.max(0, Date.parse(result.expiresAt) - Date.now()),
        );
      } else {
        const anchor = document.createElement('a');
        anchor.href = result.url;
        anchor.referrerPolicy = 'no-referrer';
        anchor.rel = 'noreferrer';
        anchor.download = file.name;
        anchor.click();
      }
    });
  }
  const ready =
    file.status === 'ready' && (!file.expiresAt || Date.parse(file.expiresAt) > now.getTime());
  return (
    <div className="space-y-3">
      <FileStatus file={file} />
      <div className="flex flex-wrap gap-2">
        {ready && (
          <Button variant="outline" disabled={action.busy} onClick={() => request(false)}>
            {t('uploads.download')}
          </Button>
        )}
        {ready && file.previewable && (
          <Button variant="outline" disabled={action.busy} onClick={() => request(true)}>
            {t('uploads.preview')}
          </Button>
        )}
      </div>
      {!ready && <p className="text-sm text-muted-foreground">{t('uploads.notReady')}</p>}
      <Feedback error={action.error} />
      {preview && (
        <img
          src={preview}
          alt={file.name}
          referrerPolicy="no-referrer"
          className="max-h-80 max-w-full rounded-md object-contain"
        />
      )}
    </div>
  );
}
