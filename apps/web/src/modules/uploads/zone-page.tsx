import { Tabs, TabsContent, TabsList, TabsTrigger } from '@backbricks/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Feedback, unwrap } from '../../dashboard/feedback.tsx';
import { useOperationalModules } from '../../dashboard/shell.tsx';
import { uploadsError, useUploadsScope } from './api.ts';
import { FilesView } from './files.tsx';
import { ZoneEmbed } from './zone-embed.tsx';
import { ZoneSettings } from './zone-settings.tsx';
export function UploadZonePage({ zoneKey }: { zoneKey: string }) {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const modules = useOperationalModules();
  const enabled = modules.data?.some((module) => module.type === 'uploads') ?? false;
  const zone = useQuery({
    queryKey: [...scope.prefix, 'zone', zoneKey],
    enabled,
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/upload-zones/{key}', {
          params: { path: { projectId: scope.projectId, key: zoneKey } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
  if (modules.isError) return <Feedback error={uploadsError(modules.error)} />;
  if (modules.data && !enabled) return <p>{t('uploads.unavailable')}</p>;
  if (zone.isPending) return <output>{t('common.loading')}</output>;
  if (zone.isError) return <Feedback error={uploadsError(zone.error)} />;
  return (
    <section
      key={`${scope.organizationId}/${scope.projectId}/${zone.data.id}`}
      className="space-y-5"
    >
      <a className="text-sm underline" href={`/projects/${scope.projectId}/upload-zones`}>
        {t('uploads.zones')}
      </a>
      <h1 className="break-words text-2xl font-semibold">{zone.data.name}</h1>
      <Tabs defaultValue="files">
        <TabsList aria-label={t('uploads.zoneSections')}>
          <TabsTrigger value="files">{t('uploads.title')}</TabsTrigger>
          <TabsTrigger value="settings">{t('dashboard.settings')}</TabsTrigger>
          <TabsTrigger value="embed">{t('dashboard.embed')}</TabsTrigger>
        </TabsList>
        <TabsContent value="files">
          <FilesView
            zoneId={zone.data.id}
            initialFile={new URLSearchParams(window.location.search).get('entry')}
          />
        </TabsContent>
        <TabsContent value="settings">
          <ZoneSettings key={zone.data.configVersion} zone={zone.data} />
        </TabsContent>
        <TabsContent value="embed">
          <ZoneEmbed zone={zone.data} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
