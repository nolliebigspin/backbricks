import { createFileRoute } from '@tanstack/react-router';

import { UploadZonesPage } from '../modules/uploads/zones.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/upload-zones/')({
  component: UploadZonesPage,
});
