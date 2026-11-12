import type { AdminOperations } from '@backbricks/sdk/admin';
import {
  Button,
  ConfirmDialog,
  DataTable,
  FieldValue,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  RecordDrawer,
  StatusBadge,
  TypedConfirmDialog,
  type DataTableColumn,
  type FieldValueLabels,
} from '@backbricks/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { useBrowserTime } from '../../dashboard/use-browser-time.ts';
import { formsError, useFormsScope, type FormInstance } from './api.ts';
import { listColumns, relativeTime, type ConfigField } from './entries-view.ts';

type Entry =
  AdminOperations['forms.submissions.list']['responses'][200]['content']['application/json']['data'][number];
type Filters = {
  folder: 'inbox' | 'spam';
  status: '' | 'open' | 'done';
  read: '' | 'true' | 'false';
  q: string;
  from: string;
  to: string;
};
const PAGE_SIZE = 50;
const initial: Filters = { folder: 'inbox', status: '', read: '', q: '', from: '', to: '' };

/** Server query parameters for the list and the CSV export (same interpretation, P2.5c). */
function queryOf(filters: Filters) {
  return {
    folder: filters.folder,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.read ? { read: filters.read } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.from ? { from: new Date(`${filters.from}T00:00:00`).toISOString() } : {}),
    ...(filters.to ? { to: new Date(`${filters.to}T23:59:59.999`).toISOString() } : {}),
  };
}

function useFieldLabels(): FieldValueLabels {
  const { t } = useTranslation();
  return {
    yes: t('forms.entries.yes'),
    no: t('forms.entries.no'),
    empty: t('forms.entries.empty'),
    accepted: (version) => t('forms.entries.accepted', { version }),
  };
}

/**
 * Entries with folders, filters, search, multi-select and a detail drawer. Every value is plain
 * text (I8). Members may change status and delete single entries; bulk delete and CSV export are
 * for owners and admins (§E.4, D46).
 */
export function EntriesTab({
  form,
  initialEntry = null,
}: {
  form: FormInstance;
  initialEntry?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { role } = useTenant();
  const manage = canManage(role);
  const scope = useFormsScope();
  const client = useQueryClient();
  const now = useBrowserTime();
  const labels = useFieldLabels();
  const [filters, setFilters] = useState<Filters>(initial);
  const [draft, setDraft] = useState(initial.q);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(initialEntry);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const action = useAction(formsError);
  const ids = { folder: useId(), status: useId(), read: useId(), from: useId(), to: useId() };
  const path = { projectId: scope.projectId, key: form.key };
  const entriesKey = [...scope.prefix, form.key, 'entries'] as const;
  const entries = useInfiniteQuery({
    queryKey: [...entriesKey, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/forms/{key}/submissions', {
          params: {
            path,
            query: {
              ...queryOf(filters),
              limit: PAGE_SIZE,
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
          headers: scope.headers,
          signal,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = entries.data?.pages.flatMap((page) => page.data) ?? [];
  const fields = listColumns(form.config);
  const refresh = async () => {
    setSelection(new Set());
    await client.invalidateQueries({ queryKey: [...scope.prefix, form.key] });
  };
  const change = (next: Partial<Filters>) => {
    setSelection(new Set());
    setFilters((current) => ({ ...current, ...next }));
  };
  const bulk = (actionName: 'read' | 'unread' | 'done' | 'open' | 'spam' | 'not_spam') =>
    action.run(async () => {
      unwrap(
        await admin.POST('/v1/projects/{projectId}/forms/{key}/submissions/bulk', {
          params: { path },
          headers: scope.headers,
          body: { ids: [...selection], action: actionName },
        }),
      );
      await refresh();
    });
  const columns: DataTableColumn<Entry>[] = [
    ...fields.map((field: ConfigField, index) => ({
      id: `data.${field.key}`,
      header: field.label,
      className: index === 0 ? undefined : 'hidden sm:table-cell',
      renderCell: (row: Entry) => (
        <span className={row.read ? undefined : 'font-semibold'}>
          <FieldValue value={row.data[field.key]} options={field.options} labels={labels} />
        </span>
      ),
    })),
    {
      id: 'received',
      header: t('forms.entries.received'),
      renderCell: (row) => (
        <time
          dateTime={row.createdAt}
          title={new Date(row.createdAt).toLocaleString(i18n.language)}
        >
          {relativeTime(new Date(row.createdAt), now, i18n.language)}
        </time>
      ),
    },
    {
      id: 'status',
      header: t('forms.entries.status'),
      className: 'hidden sm:table-cell',
      renderCell: (row) => (
        <span className="flex flex-wrap gap-1">
          {!row.read && <StatusBadge tone="positive">{t('forms.entries.new')}</StatusBadge>}
          <StatusBadge tone={row.status === 'done' ? 'neutral' : 'warning'}>
            {t(`forms.entries.statuses.${row.status}`)}
          </StatusBadge>
          {row.isTest && <StatusBadge tone="neutral">{t('forms.entries.test')}</StatusBadge>}
        </span>
      ),
    },
  ];
  const exportUrl = `/v1/projects/${encodeURIComponent(scope.projectId)}/forms/${encodeURIComponent(form.key)}/export.csv?${new URLSearchParams(queryOf(filters)).toString()}`;
  return (
    <div className="space-y-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('forms.entries.folders')}</legend>
        {(['inbox', 'spam'] as const).map((folder) => (
          <Button
            key={folder}
            variant={filters.folder === folder ? 'default' : 'outline'}
            aria-pressed={filters.folder === folder}
            onClick={() => change({ folder })}
          >
            {t(`forms.entries.folder.${folder}`)}
          </Button>
        ))}
      </fieldset>
      <search>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change({ q: draft.trim() });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={ids.status}>{t('forms.entries.status')}</Label>
            <NativeSelect
              id={ids.status}
              value={filters.status}
              onChange={(event) => change({ status: statusOf(event.target.value) })}
            >
              <NativeSelectOption value="">{t('forms.entries.any')}</NativeSelectOption>
              <NativeSelectOption value="open">
                {t('forms.entries.statuses.open')}
              </NativeSelectOption>
              <NativeSelectOption value="done">
                {t('forms.entries.statuses.done')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.read}>{t('forms.entries.readFilter')}</Label>
            <NativeSelect
              id={ids.read}
              value={filters.read}
              onChange={(event) => change({ read: readOf(event.target.value) })}
            >
              <NativeSelectOption value="">{t('forms.entries.any')}</NativeSelectOption>
              <NativeSelectOption value="false">{t('forms.entries.unread')}</NativeSelectOption>
              <NativeSelectOption value="true">{t('forms.entries.read')}</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.from}>{t('forms.entries.from')}</Label>
            <Input
              id={ids.from}
              type="date"
              value={filters.from}
              onChange={(event) => change({ from: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.to}>{t('forms.entries.to')}</Label>
            <Input
              id={ids.to}
              type="date"
              value={filters.to}
              onChange={(event) => change({ to: event.target.value })}
            />
          </div>
          <div className="flex min-w-48 flex-1 gap-2">
            <Input
              aria-label={t('forms.entries.search')}
              placeholder={t('forms.entries.search')}
              maxLength={200}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" variant="outline">
              {t('forms.entries.searchButton')}
            </Button>
          </div>
        </form>
      </search>
      {selection.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
          role="toolbar"
          aria-label={t('forms.entries.bulkLabel')}
        >
          <span className="text-sm">{t('forms.entries.selected', { count: selection.size })}</span>
          <Button variant="outline" disabled={action.busy} onClick={() => bulk('read')}>
            {t('forms.entries.markRead')}
          </Button>
          <Button variant="outline" disabled={action.busy} onClick={() => bulk('unread')}>
            {t('forms.entries.markUnread')}
          </Button>
          <Button variant="outline" disabled={action.busy} onClick={() => bulk('done')}>
            {t('forms.entries.markDone')}
          </Button>
          <Button variant="outline" disabled={action.busy} onClick={() => bulk('open')}>
            {t('forms.entries.markOpen')}
          </Button>
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => bulk(filters.folder === 'spam' ? 'not_spam' : 'spam')}
          >
            {t(filters.folder === 'spam' ? 'forms.entries.notSpam' : 'forms.entries.markSpam')}
          </Button>
          {manage && (
            <Button
              variant="destructive"
              disabled={action.busy}
              onClick={() => setConfirmBulkDelete(true)}
            >
              {t('forms.entries.deleteSelected')}
            </Button>
          )}
        </div>
      )}
      <Feedback error={action.error} />
      {entries.isPending ? (
        <output>{t('common.loading')}</output>
      ) : entries.isError ? (
        <Feedback error={formsError(entries.error)} />
      ) : rows.length === 0 ? (
        <p>{t(filters.folder === 'spam' ? 'forms.entries.noSpam' : 'forms.entries.none')}</p>
      ) : (
        <DataTable
          rows={rows}
          caption={t('forms.entries.caption')}
          columns={columns}
          getRowId={(row) => row.id}
          selection={selection}
          onSelectionChange={setSelection}
          selectLabel={(row) =>
            t('forms.entries.selectOne', {
              time: new Date(row.createdAt).toLocaleString(i18n.language),
            })
          }
          selectAllLabel={t('forms.entries.selectAll')}
          onOpen={(row) => setOpenId(row.id)}
          openLabel={(row) =>
            t('forms.entries.open', { time: new Date(row.createdAt).toLocaleString(i18n.language) })
          }
        />
      )}
      <div className="flex flex-wrap gap-3">
        {entries.hasNextPage && (
          <Button variant="outline" onClick={() => void entries.fetchNextPage()}>
            {t('common.more')}
          </Button>
        )}
        {manage && (
          <a className="text-sm underline" href={exportUrl} download>
            {t('forms.entries.download')}
          </a>
        )}
      </div>
      {openId && (
        <EntryDrawer form={form} id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
      )}
      {confirmBulkDelete && (
        <TypedConfirmDialog
          title={t('forms.entries.deleteTitle', { count: selection.size })}
          description={t('forms.entries.deleteDescription', { count: selection.size })}
          confirmText={form.key}
          typeLabel={t('forms.danger.typeKey', { key: form.key })}
          confirmLabel={t('forms.entries.deleteSelected')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirmBulkDelete(false)}
          onConfirm={() => {
            setConfirmBulkDelete(false);
            action.run(async () => {
              unwrap(
                await admin.POST('/v1/projects/{projectId}/forms/{key}/submissions/bulk-delete', {
                  params: { path },
                  headers: scope.headers,
                  body: { ids: [...selection] },
                }),
              );
              await refresh();
            });
          }}
        />
      )}
    </div>
  );
}

const statusOf = (value: string): Filters['status'] =>
  value === 'open' || value === 'done' ? value : '';
const readOf = (value: string): Filters['read'] =>
  value === 'true' || value === 'false' ? value : '';

/** Details with historical labels; opening an unread entry marks it read. */
function EntryDrawer({
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
  const additional = Object.entries(data?.additionalData ?? {});
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
                  <FieldValue
                    value={data.data[field.key]}
                    options={field.options}
                    labels={labels}
                  />
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
