import { createFileRoute } from '@tanstack/react-router';

import { ProjectOverview } from '../dashboard/project-overview.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/')({
  component: ProjectOverview,
});
