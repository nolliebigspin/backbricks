import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { moduleView } from '../../../test/module-view.tsx';
import { configObject } from '../../dashboard/config-values.ts';
import { initI18n } from '../../i18n/index.ts';
import type { UploadZone } from './api.ts';
import { ZoneSettings } from './zone-settings.tsx';

let restore: (() => void) | undefined;
afterEach(() => {
  cleanup();
  restore?.();
});
const zone: UploadZone = {
  id: 'mod_zone',
  organizationId: 'org_test',
  projectId: 'prj_test',
  moduleType: 'uploads',
  key: 'cv',
  name: 'Applications',
  status: 'active',
  configVersion: 7,
  moduleVersion: 1,
  createdAt: '2026-11-16T00:00:00Z',
  updatedAt: '2026-11-16T00:00:00Z',
  config: {
    presets: ['pdf'],
    maxSizeMb: 5,
    scanRequired: true,
    retentionDays: 180,
    spam: { honeypotField: '_trap' },
    limits: { perMinute: 9 },
  },
};
function mount(role: 'member' | 'admin' = 'admin', destructive = false, stale = false) {
  const f = moduleView(
    <ZoneSettings zone={zone} />,
    ({ path, request }) => {
      if (path.endsWith('/config') && request.method === 'GET')
        return Response.json({
          $schema: 'https://backbricks.app/schema/config.v1.json',
          project: 'prj_test',
          modules: {
            'upload-zones': {
              cv: {
                name: zone.name,
                status: zone.status,
                moduleVersion: 1,
                configVersion: stale ? 8 : 7,
                config: zone.config,
              },
            },
          },
        });
      if (path.endsWith('/config'))
        return Response.json({
          planHash: 'plan',
          destructive,
          changes: [{ resource: 'upload-zones', key: 'cv', destructive }],
          warnings: [],
          expiresAt: '2027-01-01T00:00:00Z',
        });
      return Response.json(zone);
    },
    role,
  );
  restore = () => f.restore();
  return f;
}
test('upload-area saves preserve hidden policies and use optimistic versions and server classification', async () => {
  await initI18n('en');
  const f = mount();
  fireEvent.change(screen.getByLabelText('Maximum file size (MiB)'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(f.calls.some((call) => call.path.endsWith('/upload-zones/cv'))).toBe(true),
  );
  expect(f.calls.find((call) => call.path.endsWith('/upload-zones/cv'))?.body).toMatchObject({
    configVersion: 7,
    config: { ...configObject(zone.config), maxSizeMb: 8 },
  });
  expect(f.calls.filter((call) => call.path.endsWith('/config'))).toHaveLength(2);
});
test('destructive policies require the zone name before the versioned write', async () => {
  await initI18n('en');
  const f = mount('admin', true);
  fireEvent.click(screen.getByLabelText('Require virus checking'));
  expect(screen.getByText(/Without virus checking/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  const dialog = within(await screen.findByRole('alertdialog'));
  const save = dialog.getByRole('button', { name: 'Save changes' });
  expect(save.hasAttribute('disabled')).toBe(true);
  expect(f.calls.some((call) => call.path.endsWith('/upload-zones/cv'))).toBe(false);
  fireEvent.change(dialog.getByLabelText('Type "cv" to confirm'), { target: { value: 'cv' } });
  fireEvent.click(save);
  await waitFor(() =>
    expect(f.calls.some((call) => call.path.endsWith('/upload-zones/cv'))).toBe(true),
  );
});
test('stale plans do not write, and member settings remain read-only in German', async () => {
  await initI18n('en');
  const f = mount('admin', false, true);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByRole('alert');
  expect(f.calls.some((call) => call.path.endsWith('/upload-zones/cv'))).toBe(false);
  cleanup();
  f.restore();
  await initI18n('de');
  mount('member');
  expect(screen.queryByRole('button', { name: 'Änderungen speichern' })).toBeNull();
  expect(screen.getByLabelText('Maximale Dateigröße (MiB)').closest('fieldset')?.disabled).toBe(
    true,
  );
});
