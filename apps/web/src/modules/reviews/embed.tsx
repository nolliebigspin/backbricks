import { SnippetTabs } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { Feedback } from '../../dashboard/feedback.tsx';
import { useIntegration } from '../../dashboard/integration.ts';
import { Code } from '../code.tsx';
import type { ReviewCollection } from './api.ts';
import { reviewSubmitExample } from './snippets.ts';

export function ReviewEmbed({ collection }: { collection: ReviewCollection }) {
  const { t } = useTranslation();
  const integration = useIntegration();
  if (integration.isPending) return <output>{t('common.loading')}</output>;
  if (integration.isError) return <Feedback error="auth.errors.generic" />;
  const key = JSON.stringify(collection.key);
  const options = JSON.stringify(
    {
      baseUrl: integration.data.baseUrl,
      publishableKey: integration.data.publicKey ?? 'YOUR_PUBLISHABLE_KEY',
    },
    null,
    2,
  );
  const client = `import { createClient } from '@backbricks/sdk';\n\nconst backbricks = createClient(${options});\n`;
  const payload = JSON.stringify(reviewSubmitExample(collection.config), null, 2);
  const submit = `${client}
await backbricks.reviews.submit(${key}, ${payload});`;
  const display = `${client}
const { data, nextCursor } = await backbricks.reviews.list(${key}, {
  sort: 'newest',
  limit: 10
});
const stats = await backbricks.reviews.stats(${key});`;
  return (
    <div className="flex flex-col gap-4">
      <p>{t('reviews.transparency')}</p>
      {!integration.data.publicKey && <p>{t('forms.embed.noKey')}</p>}
      <SnippetTabs
        label={t('reviews.tabs.embed')}
        snippets={[
          { id: 'submit', label: t('reviews.embedSubmit'), content: <Code value={submit} /> },
          { id: 'display', label: t('reviews.embedDisplay'), content: <Code value={display} /> },
        ]}
      />
    </div>
  );
}
