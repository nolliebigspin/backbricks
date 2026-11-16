import { NativeSelect, NativeSelectOption } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { rememberLanguage } from './index.ts';

/** The one language switch, shown on account screens and in the dashboard sidebar. */
export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return (
    <NativeSelect
      size="sm"
      aria-label={t('common.language')}
      value={i18n.language}
      onChange={(e) => {
        const language = e.target.value;
        if (language !== 'en' && language !== 'de') return;
        rememberLanguage(language);
        void i18n.changeLanguage(language);
        document.documentElement.lang = language;
      }}
    >
      <NativeSelectOption value="en" lang="en">
        {t('languages.en')}
      </NativeSelectOption>
      <NativeSelectOption value="de" lang="de">
        {t('languages.de')}
      </NativeSelectOption>
    </NativeSelect>
  );
}
