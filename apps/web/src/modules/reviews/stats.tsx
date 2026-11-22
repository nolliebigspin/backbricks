import { Card, CardContent, CardHeader, CardTitle } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { accountError } from '../../auth/navigation.ts';
import { Feedback } from '../../dashboard/feedback.tsx';
import { useReviewStats } from './api.ts';

export function ReviewStats({ collection }: { collection: string }) {
  const { t, i18n } = useTranslation();
  const query = useReviewStats(collection);
  if (query.isPending) return <output>{t('common.loading')}</output>;
  if (query.isError) return <Feedback error={accountError(query.error)} />;
  const stats = query.data;
  const format = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const highest = Math.max(1, ...stats.distribution.map(({ count }) => count));
  return (
    <section className="grid max-w-3xl gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('reviews.average')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">
              {stats.average === null
                ? t('reviews.noRating')
                : t('reviews.score', {
                    rating: format.format(stats.average),
                    scale: stats.ratingScale,
                  })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('reviews.tabs.published')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">{format.format(stats.count)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('reviews.tabs.to_review')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">
              {format.format(stats.moderation.pending + stats.moderation.approved)}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('reviews.distribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2">
            {stats.distribution.toReversed().map(({ rating, count }) => (
              <li key={rating} className="flex items-center gap-3 tabular-nums">
                <span className="w-8">{rating}</span>
                <progress
                  aria-hidden="true"
                  className="h-2 min-w-0 flex-1 accent-primary"
                  value={count}
                  max={highest}
                />
                <span className="w-16 text-right">{format.format(count)}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
