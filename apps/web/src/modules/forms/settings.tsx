import { Button, Input, Label, RetentionPicker, StatusBadge } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap } from '../../dashboard/feedback.tsx';
import { useProject } from '../../dashboard/project-shell.tsx';
import { formsError, useFormsScope, type FormInstance } from './api.ts';
import { DangerZone } from './danger-zone.tsx';
import { NotificationRules } from './notification-rules.tsx';
import {
  readSettings,
  redirectOutsideOrigins,
  writeSettings,
  type FormSettings,
} from './settings-config.ts';

/** Spam protection, retention and redirects; read-only for members (§E.4). */
export function FormSettingsTab({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const { role } = useTenant();
  const manage = canManage(role);
  return (
    <div className="space-y-8">
      {!manage && <p>{t('forms.settings.readOnly')}</p>}
      {/* Remount on a new version so the inputs show what the server stored. */}
      <SettingsForm key={form.configVersion} form={form} disabled={!manage} />
      {manage && <NotificationRules form={form} />}
      {manage && <DangerZone form={form} />}
    </div>
  );
}

function SettingsForm({ form, disabled }: { form: FormInstance; disabled: boolean }) {
  const { t } = useTranslation();
  const project = useProject();
  const scope = useFormsScope();
  const client = useQueryClient();
  const [settings, setSettings] = useState<FormSettings>(() => readSettings(form.config));
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = {
    pow: useId(),
    honeypot: useId(),
    retention: useId(),
    success: useId(),
    error: useId(),
  };
  const update = (change: Partial<FormSettings>) => {
    setDone(false);
    setSettings((current) => ({ ...current, ...change }));
  };
  const outside = (url: string) =>
    redirectOutsideOrigins(url, project.allowedOrigins) && (
      <p className="text-sm text-destructive">{t('forms.settings.redirectOutside')}</p>
    );
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        void (async () => {
          try {
            unwrap(
              await admin.PUT('/v1/projects/{projectId}/forms/{key}', {
                params: { path: { projectId: scope.projectId, key: form.key } },
                headers: scope.headers,
                body: {
                  configVersion: form.configVersion,
                  config: writeSettings(form.config, settings),
                },
              }),
            );
            setDone(true);
            await client.invalidateQueries({ queryKey: scope.prefix });
          } catch (cause) {
            setError(formsError(cause));
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <fieldset className="space-y-6" disabled={disabled || busy}>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('forms.settings.spam')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={ids.pow}
              type="checkbox"
              checked={settings.proofOfWork}
              onChange={(event) => update({ proofOfWork: event.target.checked })}
            />
            <Label htmlFor={ids.pow}>{t('forms.settings.proofOfWork')}</Label>
            {!settings.proofOfWork && (
              <StatusBadge tone="warning">{t('forms.settings.lessProtected')}</StatusBadge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t('forms.settings.proofOfWorkHint')}</p>
          <div className="max-w-sm space-y-2">
            <Label htmlFor={ids.honeypot}>{t('forms.settings.honeypot')}</Label>
            <Input
              id={ids.honeypot}
              value={settings.honeypotField}
              required
              maxLength={64}
              pattern="[A-Za-z_][A-Za-z0-9_]*"
              onChange={(event) => update({ honeypotField: event.target.value })}
            />
            <p className="text-sm text-muted-foreground">{t('forms.settings.honeypotHint')}</p>
          </div>
        </section>
        <section className="max-w-sm space-y-2">
          <h2 className="text-lg font-semibold">{t('forms.settings.retention')}</h2>
          <Label htmlFor={ids.retention}>{t('forms.settings.retentionLabel')}</Label>
          <RetentionPicker
            id={ids.retention}
            value={settings.retentionDays}
            onChange={(retentionDays) => update({ retentionDays })}
            dayLabel={(days) => t('forms.settings.days', { count: days })}
            unlimitedLabel={t('forms.settings.unlimited')}
          />
          <p className="text-sm text-muted-foreground">
            {settings.retentionDays === null
              ? t('forms.settings.unlimitedHint')
              : t('forms.settings.retentionHint', { count: settings.retentionDays })}
          </p>
        </section>
        <section className="max-w-xl space-y-3">
          <h2 className="text-lg font-semibold">{t('forms.settings.redirects')}</h2>
          <p className="text-sm text-muted-foreground">{t('forms.settings.redirectsHint')}</p>
          <div className="space-y-2">
            <Label htmlFor={ids.success}>{t('forms.settings.successRedirect')}</Label>
            <Input
              id={ids.success}
              type="url"
              value={settings.successRedirect}
              onChange={(event) => update({ successRedirect: event.target.value })}
            />
            {outside(settings.successRedirect)}
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.error}>{t('forms.settings.errorRedirect')}</Label>
            <Input
              id={ids.error}
              type="url"
              value={settings.errorRedirect}
              disabled={!settings.successRedirect}
              onChange={(event) => update({ errorRedirect: event.target.value })}
            />
            {outside(settings.errorRedirect)}
          </div>
        </section>
        {!disabled && (
          <Button type="submit" disabled={busy}>
            {t('common.save')}
          </Button>
        )}
      </fieldset>
      <Feedback error={error} done={done} />
      {error === 'forms.errors.stale' && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void client.invalidateQueries({ queryKey: scope.prefix })}
        >
          {t('forms.errors.reload')}
        </Button>
      )}
    </form>
  );
}
