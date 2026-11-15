import { createFileRoute } from '@tanstack/react-router';

import { FilesPage } from '../modules/uploads/files.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/files')({
  component: FilesPage,
});
