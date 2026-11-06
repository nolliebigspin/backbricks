import { createFileRoute } from '@tanstack/react-router';

import { AuthPage } from '../auth/auth-page.tsx';
export const Route = createFileRoute('/check-email')({
  component: () => <AuthPage screen="checkEmail" />,
});
