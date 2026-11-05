import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './de.json';
import en from './en.json';

/** Dashboard languages (ARCHITECTURE §1 A4). All copy goes through these keys. */
export const resources = { en: { translation: en }, de: { translation: de } } as const;
export type Language = keyof typeof resources;

export function detectLanguage(preferred: readonly string[]): Language {
  return preferred.some((tag) => tag.toLowerCase().startsWith('de')) ? 'de' : 'en';
}

export async function initI18n(language: Language): Promise<i18n> {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    // React escapes values; i18next escaping would double-escape them.
    interpolation: { escapeValue: false },
  });
  return instance;
}
