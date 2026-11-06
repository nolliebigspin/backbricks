import type { AdminOperations } from '@backbricks/sdk/admin';
import { Button } from '@backbricks/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceField, Field, formText } from '../auth/fields.tsx';
import { Feedback, useAction } from './feedback.tsx';

type Creation = AdminOperations['createKey']['requestBody']['content']['application/json'];
type Preset = Extract<Creation, { preset: string }>['preset'];
const presetCopy = {
  agent: 'keys.presets.agent',
  server_integration: 'keys.presets.server',
  data_access: 'keys.presets.data',
} satisfies Record<Preset, string>;
function isPreset(value: string): value is Preset {
  return Object.hasOwn(presetCopy, value);
}

export function KeyForm({ create }: { create: (body: Creation) => Promise<void> }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Creation['kind']>('publishable');
  const [preset, setPreset] = useState<Preset>('agent');
  const [nonExpiring, setNonExpiring] = useState(false);
  const action = useAction();
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        action.run(async () => {
          const fields = {
            name: formText(values, 'name'),
            expiresAt: nonExpiring ? null : new Date(formText(values, 'expiry')).toISOString(),
          };
          await create(kind === 'publishable' ? { ...fields, kind } : { ...fields, kind, preset });
        });
      }}
    >
      <Field name="name" label={t('common.name')} required maxLength={120} />
      <ChoiceField
        label={t('keys.kind')}
        value={kind}
        onChange={(e) => setKind(e.target.value === 'secret' ? 'secret' : 'publishable')}
      >
        <option value="publishable">{t('keys.publishable')}</option>
        <option value="secret">{t('keys.secret')}</option>
      </ChoiceField>
      <p className="text-sm text-muted-foreground">
        {t(kind === 'secret' ? 'keys.secretHint' : 'keys.publicHint')}
      </p>
      {kind === 'secret' && (
        <>
          <ChoiceField
            label={t('keys.access')}
            value={preset}
            onChange={(e) => {
              if (isPreset(e.target.value)) setPreset(e.target.value);
            }}
          >
            {Object.entries(presetCopy).map(([id, label]) => (
              <option key={id} value={id}>
                {t(`${label}.title`)}
              </option>
            ))}
          </ChoiceField>
          <p className="text-sm text-muted-foreground">{t(`${presetCopy[preset]}.description`)}</p>
        </>
      )}
      <Field
        name="expiry"
        label={t('keys.expiry')}
        type="datetime-local"
        disabled={nonExpiring}
        required={!nonExpiring}
      />
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={nonExpiring}
          onChange={(e) => setNonExpiring(e.target.checked)}
        />
        {t('keys.noExpiry')}
      </label>
      <Feedback error={action.error} />
      <Button disabled={action.busy} type="submit">
        {t(action.busy ? 'common.working' : 'keys.create')}
      </Button>
    </form>
  );
}
