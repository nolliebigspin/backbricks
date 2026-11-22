import {
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Field, formText } from '../../auth/fields.tsx';
import { accountError } from '../../auth/navigation.ts';
import { configObject } from '../../dashboard/config-values.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { useOperationalModules } from '../../dashboard/operational-modules.ts';
import { useReviewCollection, useReviewCollections, useReviewsScope } from './api.ts';
import { ReviewEmbed } from './embed.tsx';
import { ReviewQueue } from './queue.tsx';
import { ReviewSettings } from './settings.tsx';
import { ReviewStats } from './stats.tsx';

const reviewsPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/reviews`;
const collectionPath = (projectId: string, key: string) =>
  `${reviewsPath(projectId)}/${encodeURIComponent(key)}`;

function AvailableReviews({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const modules = useOperationalModules();
  if (modules.isPending) return <output>{t('common.loading')}</output>;
  if (modules.isError) return <Feedback error={accountError(modules.error)} />;
  return modules.data.some((entry) => entry.type === 'reviews') ? (
    children
  ) : (
    <p>{t('reviews.unavailable')}</p>
  );
}

export function ReviewCollectionsPage() {
  return (
    <AvailableReviews>
      <Collections />
    </AvailableReviews>
  );
}

function Collections() {
  const { t } = useTranslation();
  const scope = useReviewsScope();
  const { role } = useTenant();
  const collections = useReviewCollections();
  const rows = collections.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('reviews.title')} description={t('reviews.summary')} />
      {collections.isPending ? (
        <output>{t('common.loading')}</output>
      ) : collections.isError ? (
        <Feedback error={accountError(collections.error)} />
      ) : rows.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <a
                className="break-words font-medium underline"
                href={collectionPath(scope.projectId, row.key)}
              >
                {row.name}
              </a>
              <StatusBadge tone={row.status === 'active' ? 'positive' : 'neutral'}>
                {t(`forms.status.${row.status}`)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('reviews.noCollections')} description={t('reviews.start')} />
      )}
      {collections.hasNextPage && (
        <Button
          variant="outline"
          className="self-start"
          disabled={collections.isFetchingNextPage}
          onClick={() => void collections.fetchNextPage()}
        >
          {t('common.more')}
        </Button>
      )}
      {canManage(role) && <CreateCollection />}
    </section>
  );
}

function CreateCollection() {
  const { t } = useTranslation();
  const scope = useReviewsScope();
  const query = useQueryClient();
  const action = useAction();
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        action.run(async () => {
          const scale = formText(data, 'scale');
          const collection = unwrap(
            await admin.POST('/v1/projects/{projectId}/review-collections', {
              params: { path: { projectId: scope.projectId } },
              headers: scope.headers,
              body: {
                key: formText(data, 'key'),
                name: formText(data, 'name'),
                ...(scale ? { config: { ratingScale: Number(scale) } } : {}),
              },
            }),
          );
          await query.invalidateQueries({ queryKey: scope.prefix });
          window.location.assign(collectionPath(scope.projectId, collection.key));
        });
      }}
    >
      <h2 className="text-lg font-semibold">{t('reviews.create')}</h2>
      <fieldset className="flex flex-col gap-4" disabled={action.busy}>
        <Field name="name" label={t('common.name')} required maxLength={120} />
        <Field
          name="key"
          label={t('common.address')}
          required
          maxLength={63}
          pattern="[a-z0-9][a-z0-9-]*"
        />
        <Field name="scale" label={t('reviews.scale')} type="number" />
        <Button type="submit" className="self-start">
          {t('reviews.create')}
        </Button>
      </fieldset>
      <Feedback error={action.error} />
    </form>
  );
}

export function ReviewCollectionPage({ collectionKey }: { collectionKey: string }) {
  return (
    <AvailableReviews>
      <Collection key={collectionKey} collectionKey={collectionKey} />
    </AvailableReviews>
  );
}

function Collection({ collectionKey }: { collectionKey: string }) {
  const { t } = useTranslation();
  const scope = useReviewsScope();
  const query = useReviewCollection(collectionKey);
  if (query.isPending) return <output>{t('common.loading')}</output>;
  if (query.isError) return <Feedback error={accountError(query.error)} />;
  const collection = query.data;
  const scale = configObject(collection.config)['ratingScale'];
  return (
    <section className="flex flex-col gap-5">
      <a href={reviewsPath(scope.projectId)} className="self-start text-sm underline">
        {t('reviews.back')}
      </a>
      <PageHeader title={collection.name}>
        <StatusBadge tone={collection.status === 'active' ? 'positive' : 'neutral'}>
          {t(`forms.status.${collection.status}`)}
        </StatusBadge>
      </PageHeader>
      <Tabs key={collection.id} defaultValue="to_review">
        <TabsList
          aria-label={t('reviews.title')}
          className="flex-wrap justify-start group-data-horizontal/tabs:h-auto"
        >
          {(['to_review', 'published', 'rejected', 'stats', 'embed', 'settings'] as const).map(
            (tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`reviews.tabs.${tab}`)}
              </TabsTrigger>
            ),
          )}
        </TabsList>
        {(['to_review', 'published', 'rejected'] as const).map((status) => (
          <TabsContent key={status} value={status} className="mt-4">
            <ReviewQueue
              collection={collection.key}
              status={status}
              ratingScale={typeof scale === 'number' ? scale : 0}
            />
          </TabsContent>
        ))}
        <TabsContent value="stats" className="mt-4">
          <ReviewStats collection={collection.key} />
        </TabsContent>
        <TabsContent value="embed" className="mt-4">
          <ReviewEmbed collection={collection} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <ReviewSettings key={collection.configVersion} collection={collection} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
