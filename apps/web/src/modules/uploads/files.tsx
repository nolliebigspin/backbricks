import { Button, ConfirmDialog, DataTable, EmptyState, type DataTableColumn } from '@backbricks/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { dateFilter } from '../../dashboard/date-filter.ts';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { useOperationalModules } from '../../dashboard/shell.tsx';
import { isProcessingFile, uploadsError, useUploadsScope, type FileItem } from './api.ts';
import { FileSize, FileStatus } from './file-access.tsx';
import { FileDrawer } from './file-drawer.tsx';
import { FilesFilters, type Filters } from './files-filters.tsx';

export function FilesPage() {
  const { t } = useTranslation();
  const modules = useOperationalModules();
  if (modules.isPending) return <output>{t('common.loading')}</output>;
  if (modules.isError) return <Feedback error={uploadsError(modules.error)} />;
  if (!modules.data.some((module) => module.type === 'uploads'))
    return <p>{t('uploads.unavailable')}</p>;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('uploads.title')}</h1>
        <ZonesLink />
      </div>
      <FilesView />
    </section>
  );
}
/** The key resets filters, selection, drawers and transient URLs at every tenant boundary. */
export function FilesView({
  zoneId,
  initialFile,
}: {
  zoneId?: string;
  initialFile?: string | null;
}) {
  const scope = useUploadsScope();
  return (
    <ScopedFiles
      key={`${scope.organizationId}/${scope.projectId}/${zoneId ?? ''}`}
      zoneId={zoneId}
      initialFile={initialFile}
    />
  );
}
function ScopedFiles({ zoneId, initialFile }: { zoneId?: string; initialFile?: string | null }) {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const { role } = useTenant();
  const manage = canManage(role);
  const client = useQueryClient();
  const action = useAction(uploadsError);
  const [filters, setFilters] = useState<Filters>({
    zoneId: zoneId ?? '',
    status: undefined,
    from: '',
    to: '',
    q: '',
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [grid, setGrid] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialFile ?? null);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const files = useQuery({
    queryKey: [...scope.prefix, 'files', filters, cursors.at(-1)],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/files', {
          params: {
            path: { projectId: scope.projectId },
            query: {
              limit: 50,
              cursor: cursors.at(-1),
              ...(filters.zoneId ? { zoneId: filters.zoneId } : {}),
              status: filters.status,
              q: filters.q || undefined,
              ...dateFilter(filters.from, filters.to),
            },
          },
          headers: scope.headers,
          signal,
        }),
      ),
    refetchInterval: (query) => (query.state.data?.data.some(isProcessingFile) ? 3000 : false),
  });
  const usage = useQuery({
    queryKey: [...scope.prefix, 'usage'],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/storage-usage', {
          params: { path: { projectId: scope.projectId } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
  function change(next: Partial<Filters>) {
    setFilters({ ...filters, ...next });
    setSelection(new Set());
    setCursors([undefined]);
  }
  const rows = files.data?.data ?? [];
  const columns: DataTableColumn<FileItem>[] = [
    {
      id: 'name',
      header: t('common.name'),
      renderCell: (file) => (
        <span className="block min-w-36 max-w-xs space-y-2 break-words font-medium">
          <span>{file.name}</span>
          <span className="block sm:hidden">
            <FileStatus file={file} />
          </span>
        </span>
      ),
    },
    {
      id: 'size',
      header: t('uploads.size'),
      className: 'whitespace-nowrap',
      renderCell: (file) => <FileSize bytes={file.size} />,
    },
    {
      id: 'status',
      className: 'hidden sm:table-cell',
      header: t('forms.entries.status'),
      renderCell: (file) => <FileStatus file={file} />,
    },
    {
      id: 'created',
      header: t('forms.entries.received'),
      className: 'hidden md:table-cell',
      renderCell: (file) => (
        <time dateTime={file.createdAt}>{new Date(file.createdAt).toLocaleDateString()}</time>
      ),
    },
  ];
  return (
    <div className="space-y-5">
      {usage.data && (
        <dl className="flex flex-wrap gap-x-8 gap-y-3 border-b pb-5 text-sm">
          {(['storedBytes', 'reservedBytes'] as const).map((key) => (
            <div key={key}>
              <dt className="text-muted-foreground">{t(`uploads.${key}`)}</dt>
              <dd className="mt-1 font-mono text-lg">
                <FileSize bytes={usage.data[key]} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {usage.isError && <Feedback error={uploadsError(usage.error)} />}
      <p className="max-w-prose text-sm text-muted-foreground">{t('uploads.storageHint')}</p>
      <FilesFilters filters={filters} change={change} fixedZone={Boolean(zoneId)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              variant={grid === value ? 'default' : 'outline'}
              aria-pressed={grid === value}
              onClick={() => setGrid(value)}
            >
              {t(value ? 'uploads.grid' : 'uploads.table')}
            </Button>
          ))}
        </div>
        {manage && selection.size > 0 && (
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={() => setConfirm([...selection])}
          >
            {t('uploads.deleteSelected', { count: selection.size })}
          </Button>
        )}
      </div>
      <Feedback error={action.error} />
      {files.isPending ? (
        <output>{t('common.loading')}</output>
      ) : files.isError ? (
        <Feedback error={uploadsError(files.error)} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('uploads.empty')} description={t('uploads.emptyHint')} />
      ) : grid ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((file) => (
            <li key={file.id} className="space-y-4 rounded-lg border p-4">
              {manage && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection.has(file.id)}
                    onChange={(event) => {
                      const next = new Set(selection);
                      if (event.target.checked) next.add(file.id);
                      else next.delete(file.id);
                      setSelection(next);
                    }}
                  />
                  {t('uploads.select', { name: file.name })}
                </label>
              )}
              <button
                className="block w-full break-all text-left font-medium underline-offset-4 hover:underline"
                onClick={() => setOpenId(file.id)}
              >
                {file.name}
              </button>
              <FileSize bytes={file.size} />
              <FileStatus file={file} />
            </li>
          ))}
        </ul>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          caption={t('uploads.title')}
          getRowId={(file) => file.id}
          {...(manage ? { selection, onSelectionChange: setSelection } : {})}
          selectLabel={(file) => t('uploads.select', { name: file.name })}
          selectAllLabel={t('uploads.selectAll')}
          onOpen={(file) => setOpenId(file.id)}
          openLabel={(file) => t('uploads.open', { name: file.name })}
        />
      )}
      <div className="flex gap-2">
        {cursors.length > 1 && (
          <Button
            variant="outline"
            onClick={() => {
              setSelection(new Set());
              setCursors(cursors.slice(0, -1));
            }}
          >
            {t('uploads.previous')}
          </Button>
        )}
        {files.data?.nextCursor && (
          <Button
            variant="outline"
            onClick={() => {
              setSelection(new Set());
              setCursors([...cursors, files.data?.nextCursor ?? undefined]);
            }}
          >
            {t('uploads.next')}
          </Button>
        )}
      </div>
      {openId && (
        <FileDrawer
          key={openId}
          id={openId}
          onClose={() => setOpenId(null)}
          onDelete={() => setConfirm([openId])}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t('uploads.deleteTitle', { count: confirm.length })}
          description={t('uploads.deleteHint')}
          confirmLabel={t('forms.entries.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const ids = confirm;
            setConfirm(null);
            action.run(async () => {
              if (ids.length === 1 && ids[0]) {
                const result = await admin.DELETE('/v1/projects/{projectId}/files/{id}', {
                  params: { path: { projectId: scope.projectId, id: ids[0] } },
                  headers: scope.headers,
                });
                if (result.error) throw result.error;
              } else
                unwrap(
                  await admin.POST('/v1/projects/{projectId}/files/bulk-delete', {
                    params: { path: { projectId: scope.projectId } },
                    headers: scope.headers,
                    body: { ids },
                  }),
                );
              setSelection(new Set());
              setOpenId(null);
              await client.invalidateQueries({ queryKey: scope.prefix });
            });
          }}
        />
      )}
    </div>
  );
}

function ZonesLink() {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  return (
    <a className="text-sm underline" href={`/projects/${scope.projectId}/upload-zones`}>
      {t('uploads.zones')}
    </a>
  );
}
