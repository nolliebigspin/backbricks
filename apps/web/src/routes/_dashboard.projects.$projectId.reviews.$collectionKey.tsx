import { createFileRoute } from '@tanstack/react-router';

import { ReviewCollectionPage } from '../modules/reviews/pages.tsx';

export const Route = createFileRoute('/_dashboard/projects/$projectId/reviews/$collectionKey')({
  component: Page,
});
function Page() {
  const { collectionKey } = Route.useParams();
  return <ReviewCollectionPage collectionKey={collectionKey} />;
}
