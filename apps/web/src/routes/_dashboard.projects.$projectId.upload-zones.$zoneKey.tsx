import { createFileRoute } from '@tanstack/react-router';

import { UploadZonePage } from '../modules/uploads/zone-page.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/upload-zones/$zoneKey')({
  component: Page,
});
function Page() {
  const { zoneKey } = Route.useParams();
  return <UploadZonePage zoneKey={zoneKey} />;
}
