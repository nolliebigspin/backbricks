import { SnippetTabs } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { Feedback } from '../../dashboard/feedback.tsx';
import { useIntegration } from '../../dashboard/integration.ts';
import { useProject } from '../../dashboard/project-shell.tsx';
import { Code } from '../code.tsx';
import type { UploadZone } from './api.ts';
import { uploadApplicationSnippets, uploadExampleCopy } from './application-snippets.ts';
import { uploadSnippets } from './snippets.ts';
export function ZoneEmbed({ zone }: { zone: UploadZone }) {
  const { t } = useTranslation();
  const project = useProject();
  const integration = useIntegration();
  if (integration.isPending) return <output>{t('common.loading')}</output>;
  if (integration.isError) return <Feedback error="auth.errors.generic" />;
  const snippets = uploadSnippets({
    baseUrl: integration.data.baseUrl,
    publishableKey: integration.data.publicKey,
    zoneKey: zone.key,
  });
  const application = uploadApplicationSnippets(
    {
      baseUrl: integration.data.baseUrl,
      publishableKey: integration.data.publicKey,
      zoneKey: zone.key,
      formKey: 'application',
    },
    uploadExampleCopy(t),
  );
  return (
    <div className="space-y-5">
      <p>{t('uploads.embedHint', { key: zone.key })}</p>
      {!integration.data.publicKey && <p>{t('forms.embed.noKey')}</p>}
      <p className="text-sm text-muted-foreground">
        {project.allowedOrigins.length
          ? t('forms.embed.origins', { origins: project.allowedOrigins.join(', ') })
          : t('forms.embed.anyOrigin')}
      </p>
      <p className="text-sm">{t('keys.secretHint')}</p>
      <SnippetTabs
        label={t('uploads.integration')}
        snippets={[
          {
            id: 'browser',
            label: t('forms.embed.sdk'),
            content: <Code value={snippets.browser} />,
          },
          {
            id: 'attachment',
            label: t('uploads.attachmentExample'),
            content: (
              <div className="space-y-4">
                <p>{t('uploads.attachmentSetup')}</p>
                <Code value={application.form} />
                <Code value={application.script} />
              </div>
            ),
          },
          {
            id: 'server',
            label: t('forms.embed.server'),
            content: <Code value={snippets.server} />,
          },
        ]}
      />
    </div>
  );
}
