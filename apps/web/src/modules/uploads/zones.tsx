import { Button, EmptyState, StatusBadge } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { ChoiceField, Field, formText } from '../../auth/fields.tsx';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { useOperationalModules } from '../../dashboard/shell.tsx';
import { templatesFor } from '../templates.ts';
import { uploadsError, useUploadsScope, useUploadZones } from './api.ts';

export function zonePath(projectId: string, key: string) {
  return `/projects/${encodeURIComponent(projectId)}/upload-zones/${encodeURIComponent(key)}`;
}
export function UploadZonesPage() {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const modules = useOperationalModules();
  if (modules.isPending) return <output>{t('common.loading')}</output>;
  if (modules.isError) return <Feedback error={uploadsError(modules.error)} />;
  if (!modules.data.some((module) => module.type === 'uploads'))
    return <p>{t('uploads.unavailable')}</p>;
  return <Zones key={`${scope.organizationId}/${scope.projectId}`} />;
}
function Zones() {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const { role } = useTenant();
  const zones = useUploadZones();
  const rows = zones.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('uploads.zones')}</h1>
      <a className="text-sm underline" href={`/projects/${scope.projectId}/files`}>
        {t('uploads.allFiles')}
      </a>
      {zones.isPending ? (
        <output>{t('common.loading')}</output>
      ) : zones.isError ? (
        <Feedback error={uploadsError(zones.error)} />
      ) : !rows.length ? (
        <EmptyState title={t('uploads.noZones')} description={t('uploads.zoneIntro')} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((zone) => (
            <li key={zone.id} className="flex items-center justify-between gap-3 p-4">
              <a
                className="break-words font-medium underline"
                href={zonePath(scope.projectId, zone.key)}
              >
                {zone.name}
              </a>
              <StatusBadge tone={zone.status === 'active' ? 'positive' : 'neutral'}>
                {t(`forms.status.${zone.status}`)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      {zones.hasNextPage && (
        <Button
          variant="outline"
          disabled={zones.isFetchingNextPage}
          onClick={() => void zones.fetchNextPage()}
        >
          {t('common.more')}
        </Button>
      )}
      {canManage(role) && <CreateZone />}
    </section>
  );
}
export function CreateZone() {
  const { t, i18n } = useTranslation();
  const scope = useUploadsScope();
  const modules = useOperationalModules();
  const client = useQueryClient();
  const action = useAction(uploadsError);
  const templates = templatesFor(
    modules.data?.find((module) => module.type === 'uploads')?.templates ?? [],
    i18n.language,
  );
  return (
    <section className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">{t('uploads.create')}</h2>
      <p className="text-sm text-muted-foreground">{t('uploads.scanHint')}</p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          action.run(async () => {
            const result = unwrap(
              await admin.POST('/v1/projects/{projectId}/upload-zones', {
                params: { path: { projectId: scope.projectId } },
                headers: scope.headers,
                body: {
                  key: formText(data, 'key'),
                  name: formText(data, 'name'),
                  template: formText(data, 'template'),
                },
              }),
            );
            await client.invalidateQueries({ queryKey: scope.prefix });
            window.location.assign(zonePath(scope.projectId, result.key));
          });
        }}
      >
        <fieldset className="space-y-4" disabled={action.busy || templates.length === 0}>
          <Field label={t('common.name')} name="name" required maxLength={120} />
          <Field
            label={t('common.address')}
            name="key"
            required
            maxLength={63}
            pattern="[a-z0-9][a-z0-9-]*"
          />
          <ChoiceField label={t('forms.create.template')} name="template">
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </ChoiceField>
          <p className="text-sm text-destructive">{t('uploads.unscannedHint')}</p>
          <Button type="submit">{t('uploads.create')}</Button>
        </fieldset>
        <Feedback error={action.error} />
      </form>
    </section>
  );
}
