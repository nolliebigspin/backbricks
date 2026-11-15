import { Button, RetentionPicker, TypedConfirmDialog } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { ChoiceField, Field } from '../../auth/fields.tsx';
import { instanceConfigIsDestructive } from '../../dashboard/config-plan.ts';
import { configObject } from '../../dashboard/config-values.ts';
import { canManage, useTenant } from '../../dashboard/context.tsx';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import { uploadsError, useUploadsScope, type UploadZone } from './api.ts';

/** The draft edits known keys and preserves every stored policy it does not expose. */
export function ZoneSettings({ zone }: { zone: UploadZone }) {
  const { t } = useTranslation();
  const scope = useUploadsScope();
  const { role } = useTenant();
  const manage = canManage(role);
  const client = useQueryClient();
  const action = useAction(uploadsError);
  const config = configObject(zone.config);
  const [presets, setPresets] = useState(() =>
    Array.isArray(config['presets'])
      ? config['presets'].filter((value): value is string => typeof value === 'string')
      : [],
  );
  const [maxSize, setMaxSize] = useState(() =>
    typeof config['maxSizeMb'] === 'number' ? String(config['maxSizeMb']) : '',
  );
  const [retention, setRetention] = useState(() =>
    config['retentionDays'] === null
      ? null
      : typeof config['retentionDays'] === 'number'
        ? config['retentionDays']
        : null,
  );
  const [scan, setScan] = useState(config['scanRequired'] !== false);
  const [status, setStatus] = useState<'active' | 'paused'>(
    zone.status === 'paused' ? 'paused' : 'active',
  );
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const path = { projectId: scope.projectId, key: zone.key };
  async function save(next: Record<string, unknown>) {
    unwrap(
      await admin.PUT('/v1/projects/{projectId}/upload-zones/{key}', {
        params: { path },
        headers: scope.headers,
        body: { configVersion: zone.configVersion, config: next, status },
      }),
    );
    setSaved(true);
    await client.invalidateQueries({ queryKey: scope.prefix });
  }
  return (
    <div className="max-w-xl space-y-5">
      {!manage && <p>{t('forms.settings.readOnly')}</p>}
      <form
        className="space-y-5"
        onChange={() => setSaved(false)}
        onSubmit={(event) => {
          event.preventDefault();
          const next = {
            ...config,
            presets,
            maxSizeMb: Number(maxSize),
            retentionDays: retention,
            scanRequired: scan,
          };
          action.run(async () => {
            if (
              await instanceConfigIsDestructive(
                scope,
                'upload-zones',
                zone.key,
                zone.configVersion,
                next,
              )
            )
              setPending(next);
            else await save(next);
          });
        }}
      >
        <fieldset className="space-y-5" disabled={!manage || action.busy}>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">{t('uploads.allowedTypes')}</legend>
            {['images', 'pdf', 'modernOffice'].map((preset) => (
              <label key={preset} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={presets.includes(preset)}
                  onChange={(event) =>
                    setPresets(
                      event.target.checked
                        ? [...presets, preset]
                        : presets.filter((value) => value !== preset),
                    )
                  }
                />
                {t(`uploads.presets.${preset}`)}
              </label>
            ))}
          </fieldset>
          <Field
            label={t('uploads.maxSize')}
            type="number"
            min={1}
            step={1}
            required
            value={maxSize}
            onChange={(event) => setMaxSize(event.target.value)}
          />
          <ChoiceField
            label={t('forms.entries.status')}
            value={status}
            onChange={(event) => setStatus(event.target.value === 'paused' ? 'paused' : 'active')}
          >
            <option value="active">{t('forms.status.active')}</option>
            <option value="paused">{t('forms.status.paused')}</option>
          </ChoiceField>
          <label className="block space-y-2">
            <span className="font-medium">{t('uploads.retention')}</span>
            <RetentionPicker
              value={retention}
              onChange={setRetention}
              dayLabel={(count) => t('forms.settings.days', { count })}
              unlimitedLabel={t('forms.settings.unlimited')}
            />
          </label>
          <p className="text-sm text-muted-foreground">{t('uploads.retentionHint')}</p>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={scan}
              onChange={(event) => setScan(event.target.checked)}
            />
            {t('uploads.scanRequired')}
          </label>
          <p className="text-sm text-muted-foreground">{t('uploads.scanHint')}</p>
          {!scan && (
            <output className="block text-sm text-destructive">{t('uploads.unscannedHint')}</output>
          )}
          {manage && (
            <Button type="submit" disabled={!presets.length}>
              {t('common.save')}
            </Button>
          )}
        </fieldset>
        <Feedback error={action.error} done={saved && action.done} />
        {action.error === 'uploads.stale' && (
          <Button
            variant="outline"
            type="button"
            onClick={() => void client.invalidateQueries({ queryKey: scope.prefix })}
          >
            {t('forms.errors.reload')}
          </Button>
        )}
      </form>
      {pending && (
        <TypedConfirmDialog
          title={t('uploads.confirmTitle')}
          description={t('uploads.confirmHint')}
          confirmText={zone.key}
          typeLabel={t('forms.danger.typeKey', { key: zone.key })}
          confirmLabel={t('common.save')}
          cancelLabel={t('common.cancel')}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const next = pending;
            setPending(null);
            action.run(() => save(next));
          }}
        />
      )}
    </div>
  );
}
