import { createFileRoute } from '@tanstack/react-router';

import { ProjectSettings } from '../dashboard/project-settings.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/settings')({
  component: ProjectSettings,
});
