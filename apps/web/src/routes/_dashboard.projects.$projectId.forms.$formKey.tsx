import { createFileRoute } from '@tanstack/react-router';

import { FormPage } from '../modules/forms/form-page.tsx';
export const Route = createFileRoute('/_dashboard/projects/$projectId/forms/$formKey')({
  component: FormRoute,
});
function FormRoute() {
  const { formKey } = Route.useParams();
  return <FormPage formKey={formKey} />;
}
