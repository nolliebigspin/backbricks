import { Button } from '@backbricks/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceField, Field } from '../../auth/fields.tsx';
import { Feedback } from '../../dashboard/feedback.tsx';
import { uploadsError, useUploadZones, type FileItem, type FilesQuery } from './api.ts';

export type Filters = {
  zoneId: string;
  status: FilesQuery['status'];
  from: string;
  to: string;
  q: string;
};
const statuses = [
  'pending',
  'uploaded',
  'scanning',
  'ready',
  'quarantined',
  'rejected',
] as const satisfies readonly FileItem['status'][];

export function FilesFilters({
  filters,
  change,
  fixedZone,
}: {
  filters: Filters;
  change: (next: Partial<Filters>) => void;
  fixedZone: boolean;
}) {
  const { t } = useTranslation();
  const zones = useUploadZones();
  const [draft, setDraft] = useState(filters.q);
  return (
    <>
      <search>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change({ q: draft.trim() });
          }}
        >
          {!fixedZone && (
            <ChoiceField
              label={t('uploads.zone')}
              value={filters.zoneId}
              onChange={(event) => change({ zoneId: event.target.value })}
            >
              <option value="">{t('forms.entries.any')}</option>
              {zones.data?.pages
                .flatMap((page) => page.data)
                .map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
            </ChoiceField>
          )}
          <ChoiceField
            label={t('forms.entries.status')}
            value={filters.status ?? ''}
            onChange={(event) =>
              change({ status: statuses.find((status) => status === event.target.value) })
            }
          >
            <option value="">{t('forms.entries.any')}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {t(`uploads.status.${status}`)}
              </option>
            ))}
          </ChoiceField>
          <Field
            label={t('forms.entries.from')}
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => change({ from: event.target.value })}
          />
          <Field
            label={t('forms.entries.to')}
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => change({ to: event.target.value })}
          />
          <Field
            label={t('uploads.search')}
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline">
            {t('forms.entries.searchButton')}
          </Button>
        </form>
      </search>
      {zones.hasNextPage && !fixedZone && (
        <Button
          variant="outline"
          disabled={zones.isFetchingNextPage}
          onClick={() => void zones.fetchNextPage()}
        >
          {t('uploads.moreZones')}
        </Button>
      )}
      {zones.isError && <Feedback error={uploadsError(zones.error)} />}
    </>
  );
}
