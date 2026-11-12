import { createFileRoute } from '@tanstack/react-router';

import { FormsInbox } from '../modules/forms/inbox.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/forms/')({
  component: FormsInbox,
});
