import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { rememberLanguage } from '../i18n/index.ts';

export const Route = createRootRoute({ component: RootLayout, notFoundComponent: MissingPage });

function RootLayout() {
  const { t, i18n } = useTranslation();
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="/" className="font-semibold tracking-tight">
          {t('app.name')}
        </a>
        <select
          aria-label={t('common.language')}
          value={i18n.language}
          onChange={(e) => {
            const language = e.target.value;
            if (language !== 'en' && language !== 'de') return;
            rememberLanguage(language);
            void i18n.changeLanguage(language);
            document.documentElement.lang = language;
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="en" lang="en">
            {t('languages.en')}
          </option>
          <option value="de" lang="de">
            {t('languages.de')}
          </option>
        </select>
      </header>
      <main className="mx-auto flex max-w-6xl justify-center px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function MissingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1>{t('common.missing')}</h1>
      <a href="/" className="underline">
        {t('dashboard.projects')}
      </a>
    </div>
  );
}
