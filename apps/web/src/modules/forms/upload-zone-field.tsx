import { Button } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { ChoiceField } from '../../auth/fields.tsx';
import { Feedback } from '../../dashboard/feedback.tsx';
import { uploadsError, useUploadZones } from '../uploads/api.ts';
/** Preserve historical keys even when an area is archived or on an unloaded page. */
export function UploadZoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const zones = useUploadZones();
  const rows = zones.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-2">
      <ChoiceField
        required
        label={t('forms.fields.rules.zone')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('uploads.chooseZone')}</option>
        {value && !rows.some((zone) => zone.key === value) && (
          <option value={value}>{value}</option>
        )}
        {rows.map((zone) => (
          <option
            key={zone.id}
            value={zone.key}
            disabled={zone.status !== 'active' && zone.key !== value}
          >
            {zone.name}
          </option>
        ))}
      </ChoiceField>
      {zones.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={zones.isFetchingNextPage}
          onClick={() => void zones.fetchNextPage()}
        >
          {t('uploads.moreZones')}
        </Button>
      )}
      {zones.isError && <Feedback error={uploadsError(zones.error)} />}
    </div>
  );
}
