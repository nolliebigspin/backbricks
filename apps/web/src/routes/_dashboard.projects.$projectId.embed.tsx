import { createFileRoute } from '@tanstack/react-router';

import { EmbedPage } from '../dashboard/embed.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/embed')({
  component: EmbedPage,
});
