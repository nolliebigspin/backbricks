import { SnippetTabs } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { accountError } from '../../auth/navigation.ts';
import { Feedback } from '../../dashboard/feedback.tsx';
import { useIntegration } from '../../dashboard/integration.ts';
import { useProject } from '../../dashboard/project-shell.tsx';
import type { FormInstance } from './api.ts';
import { configFields } from './entries-view.ts';
import { readSettings } from './settings-config.ts';
import { formSnippets, SECRET_KEY_ENV } from './snippets.ts';

/** Copy-ready code for this form, filled with the project's publishable key (§E.6). */
export function EmbedTab({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const project = useProject();
  const integration = useIntegration();
  const settings = readSettings(form.config);
  const projectEmbed = `/projects/${encodeURIComponent(project.id)}/embed`;
  if (integration.isPending) return <output>{t('common.loading')}</output>;
  if (integration.isError) return <Feedback error={accountError(integration.error)} />;
  const { baseUrl, publicKey } = integration.data;
  const snippets = formSnippets({
    baseUrl,
    publishableKey: publicKey,
    formKey: form.key,
    fields: configFields(form.config),
    honeypotField: settings.honeypotField,
  });
  return (
    <div className="space-y-6">
      {!publicKey && (
        <output className="block">
          {t('forms.embed.noKey')}{' '}
          <a className="underline" href={projectEmbed}>
            {t('forms.embed.keysLink')}
          </a>
        </output>
      )}
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>
          {project.allowedOrigins.length
            ? t('forms.embed.origins', { origins: project.allowedOrigins.join(', ') })
            : t('forms.embed.anyOrigin')}
        </li>
        <li>{t('forms.embed.honeypot', { name: settings.honeypotField })}</li>
      </ul>
      <SnippetTabs
        label={t('forms.embed.label')}
        snippets={[
          {
            id: 'html',
            label: t('forms.embed.html'),
            content: (
              <div className="space-y-3">
                <p>{t('forms.embed.htmlHint')}</p>
                {settings.proofOfWork && (
                  <p className="text-destructive">{t('forms.embed.htmlNeedsPowOff')}</p>
                )}
                {!settings.successRedirect && (
                  <p className="text-destructive">{t('forms.embed.htmlNeedsRedirect')}</p>
                )}
                <Code value={snippets.html} />
              </div>
            ),
          },
          {
            id: 'sdk',
            label: t('forms.embed.sdk'),
            content: (
              <div className="space-y-3">
                <p>{t('forms.embed.sdkHint')}</p>
                <p className="font-medium">{t('forms.embed.sdkForm')}</p>
                <Code value={snippets.sdkForm} />
                <p className="font-medium">{t('forms.embed.sdkScript')}</p>
                <Code value={snippets.sdk} />
              </div>
            ),
          },
          {
            id: 'server',
            label: t('forms.embed.server'),
            content: (
              <div className="space-y-3">
                <p>{t('forms.embed.serverHint', { env: SECRET_KEY_ENV })}</p>
                <Code value={snippets.server} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function Code({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
      <code>{value}</code>
    </pre>
  );
}
