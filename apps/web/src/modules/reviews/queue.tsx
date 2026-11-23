import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  RecordDrawer,
  StatusBadge,
} from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { accountError } from '../../auth/navigation.ts';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import {
  useReviewDetail,
  useReviewQueue,
  useReviewsScope,
  type ReviewAction,
  type ReviewItem,
} from './api.ts';

type QueueTab = 'to_review' | 'published' | 'rejected';

export function ReviewQueue({
  collection,
  status,
  ratingScale,
}: {
  collection: string;
  status: QueueTab;
  ratingScale: number;
}) {
  const { t, i18n } = useTranslation();
  const scope = useReviewsScope();
  const client = useQueryClient();
  const query = useReviewQueue(collection, status);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const detail = useReviewDetail(selected);
  const action = useAction();
  const queue = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const recordPath = '/v1/projects/{projectId}/reviews/{id}';

  function moderate(review: ReviewItem, next: ReviewAction) {
    action.run(async () => {
      unwrap(
        await admin.PATCH(recordPath, {
          params: { path: { projectId: scope.projectId, id: review.id } },
          headers: scope.headers,
          body: { action: next },
        }),
      );
      await client.invalidateQueries({ queryKey: scope.prefix });
      if (document.activeElement === document.body) queue.current?.focus();
    });
  }

  function closeDetails() {
    setSelected(null);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else queue.current?.focus();
    });
  }

  return (
    <section
      ref={queue}
      tabIndex={-1}
      aria-label={t(`reviews.tabs.${status}`)}
      className="flex flex-col gap-4"
    >
      <Feedback error={action.error} done={action.done} />
      {query.isPending ? (
        <output>{t('common.loading')}</output>
      ) : query.isError ? (
        <Feedback error={accountError(query.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t(`reviews.empty.${status}`)}
          description={t(`reviews.hint.${status}`)}
        />
      ) : (
        <>
          {status === 'to_review' && (
            <p className="text-sm text-muted-foreground">{t('reviews.shortcuts')}</p>
          )}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {rows.map((review) => (
              <article
                key={review.id}
                aria-label={t('reviews.cardLabel', { author: review.authorName })}
                className="min-w-0"
              >
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-lg tabular-nums">
                        {t('reviews.score', { rating: review.rating, scale: ratingScale })}
                      </span>
                      <StatusBadge tone={review.publishedAt ? 'positive' : 'neutral'}>
                        {t(
                          `reviews.states.${review.publishedAt ? 'published' : review.moderationStatus}`,
                        )}
                      </StatusBadge>
                    </div>
                    <CardTitle className="break-words">
                      {review.title ?? t('reviews.untitled')}
                    </CardTitle>
                    <CardDescription className="break-words">
                      {review.authorName} ·{' '}
                      {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                        new Date(review.createdAt),
                      )}
                    </CardDescription>
                  </CardHeader>
                  {review.body && (
                    <CardContent>
                      <p className="line-clamp-4 whitespace-pre-wrap break-words">{review.body}</p>
                    </CardContent>
                  )}
                  <CardFooter>
                    <div className="flex flex-wrap gap-2">
                      {review.publishedAt ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action.busy}
                          onClick={() => moderate(review, 'unpublish')}
                        >
                          {t('reviews.actions.unpublish')}
                        </Button>
                      ) : review.moderationStatus === 'approved' ? (
                        <Button
                          size="sm"
                          disabled={action.busy || review.isTest}
                          onClick={() => moderate(review, 'publish')}
                        >
                          {t('reviews.actions.publish')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={action.busy}
                          onClick={() => moderate(review, 'approve')}
                        >
                          {t('reviews.actions.approve')}
                        </Button>
                      )}
                      {review.moderationStatus !== 'rejected' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={action.busy}
                          onClick={() => moderate(review, 'reject')}
                        >
                          {t('reviews.actions.reject')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onKeyDown={(event) => {
                          if (
                            status !== 'to_review' ||
                            event.repeat ||
                            action.busy ||
                            event.ctrlKey ||
                            event.altKey ||
                            event.metaKey ||
                            event.shiftKey ||
                            event.nativeEvent.isComposing
                          )
                            return;
                          const key = event.key.toLowerCase();
                          if (key === 'a' && review.moderationStatus === 'pending')
                            moderate(review, 'approve');
                          else if (key === 'r') moderate(review, 'reject');
                          else return;
                          event.preventDefault();
                        }}
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setSelected(review.id);
                        }}
                      >
                        {t('reviews.details')}
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              </article>
            ))}
          </div>
          {query.hasNextPage && (
            <Button
              className="self-start"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t('common.more')}
            </Button>
          )}
        </>
      )}
      <RecordDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDetails();
        }}
        title={detail.data?.title ?? t('reviews.details')}
        closeLabel={t('common.close')}
        actions={
          selected &&
          detail.data && (
            <Button
              variant="destructive"
              disabled={action.busy}
              onClick={() => setDeleting(selected)}
            >
              {t('reviews.actions.delete')}
            </Button>
          )
        }
      >
        {detail.isError && <Feedback error={accountError(detail.error)} />}
        {selected && detail.isPending && <output>{t('common.loading')}</output>}
        {detail.data && (
          <div className="flex flex-col gap-3">
            <p className="break-words font-medium">{detail.data.authorName}</p>
            {detail.data.email && <p className="break-words">{detail.data.email}</p>}
            {detail.data.body && (
              <p className="whitespace-pre-wrap break-words">{detail.data.body}</p>
            )}
            {detail.data.spamVerdict !== 'clean' && (
              <StatusBadge tone="warning">
                {t(`reviews.spam.${detail.data.spamVerdict}`)}
              </StatusBadge>
            )}
            {detail.data.isTest && <StatusBadge tone="neutral">{t('reviews.test')}</StatusBadge>}
            {(
              [
                ['publicFields', detail.data.publicFields],
                ['privateFields', detail.data.privateFields],
              ] as const
            ).map(
              ([name, fields]) =>
                Object.keys(fields).length > 0 && (
                  <section key={name}>
                    <h3 className="font-medium">{t(`reviews.${name}`)}</h3>
                    <dl className="grid gap-2">
                      {Object.entries(fields).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-muted-foreground">{key}</dt>
                          <dd className="break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ),
            )}
          </div>
        )}
      </RecordDrawer>
      {deleting && (
        <ConfirmDialog
          title={t('reviews.deleteTitle')}
          description={t('reviews.deleteHint')}
          confirmLabel={t('reviews.actions.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting;
            setDeleting(null);
            action.run(async () => {
              const { error } = await admin.DELETE(recordPath, {
                params: { path: { projectId: scope.projectId, id } },
                headers: scope.headers,
              });
              if (error) throw error;
              closeDetails();
              await client.invalidateQueries({ queryKey: scope.prefix });
            });
          }}
        />
      )}
    </section>
  );
}
