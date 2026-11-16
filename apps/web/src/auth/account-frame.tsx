import { Logo } from '@backbricks/ui';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageSelect } from '../i18n/language-select.tsx';

/** Account screens: one panel on the mortar ground, with nothing else competing for attention. */
export function AccountFrame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-muted">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-10 pb-8 sm:pt-16">
        <a href="/" aria-label={t('app.name')}>
          <Logo />
        </a>
        <LanguageSelect />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16">{children}</main>
    </div>
  );
}
