import { createFileRoute } from '@tanstack/react-router';

import { ProjectShell } from '../dashboard/project-shell.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId')({
  component: ProjectRoute,
});
function ProjectRoute() {
  const { projectId } = Route.useParams();
  return <ProjectShell projectId={projectId} />;
}
