import { createFileRoute } from '@tanstack/react-router';

import { ReviewCollectionsPage } from '../modules/reviews/pages.tsx';

export const Route = createFileRoute('/_dashboard/projects/$projectId/reviews/')({
  component: ReviewCollectionsPage,
});
