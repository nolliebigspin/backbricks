import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AccountFrame } from '../auth/account-frame.tsx';

export const Route = createRootRoute({ component: Outlet, notFoundComponent: MissingPage });

function MissingPage() {
  const { t } = useTranslation();
  return (
    <AccountFrame>
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">{t('common.missing')}</h1>
        <a href="/" className="text-sm underline underline-offset-4">
          {t('dashboard.projects')}
        </a>
      </div>
    </AccountFrame>
  );
}
