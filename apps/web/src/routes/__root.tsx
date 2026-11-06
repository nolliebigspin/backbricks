import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createRootRoute({ component: RootLayout });

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
            void i18n.changeLanguage(language);
            document.documentElement.lang = language;
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="en" lang="en">
            English
          </option>
          <option value="de" lang="de">
            Deutsch
          </option>
        </select>
      </header>
      <main className="mx-auto flex max-w-6xl justify-center px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
