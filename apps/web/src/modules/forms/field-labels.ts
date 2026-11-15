import type { FieldValueLabels } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

export function useFieldLabels(): FieldValueLabels {
  const { t } = useTranslation();
  return {
    yes: t('forms.entries.yes'),
    no: t('forms.entries.no'),
    empty: t('forms.entries.empty'),
    accepted: (version) => t('forms.entries.accepted', { version }),
  };
}
