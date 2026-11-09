import { createFileRoute } from '@tanstack/react-router';

import { AuthPage } from '../auth/auth-page.tsx';
export const Route = createFileRoute('/forgot-password')({
  component: () => <AuthPage screen="forgot" />,
});
