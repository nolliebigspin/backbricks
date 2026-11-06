import { createFileRoute } from '@tanstack/react-router';

import { AuthPage } from '../auth/auth-page.tsx';
export const Route = createFileRoute('/accept-invitation')({
  component: () => <AuthPage screen="invitation" />,
});
