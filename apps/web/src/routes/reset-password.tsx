import { createFileRoute } from '@tanstack/react-router';

import { AuthPage } from '../auth/auth-page.tsx';
export const Route = createFileRoute('/reset-password')({
  component: () => <AuthPage screen="reset" />,
});
