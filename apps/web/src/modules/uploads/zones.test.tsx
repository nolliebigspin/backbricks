import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { moduleView } from '../../../test/module-view.tsx';
import { initI18n } from '../../i18n/index.ts';
import { uploadsError } from './api.ts';
import { CreateZone } from './zones.tsx';
let restore: (() => void) | undefined;
afterEach(() => {
  cleanup();
  restore?.();
});
test('upload templates require an explicit unscanned choice and unavailable scanning explains recovery', async () => {
  await initI18n('en');
  const f = moduleView(<CreateZone />, ({ path }) =>
    path.endsWith('/meta')
      ? Response.json({
          modules: [
            {
              type: 'uploads',
              operational: true,
              templates: [
                { key: 'cv-en', name: 'CV (PDF)' },
                { key: 'cv-unscanned-en', name: 'CV without malware scanning' },
                { key: 'cv-de', name: 'Lebenslauf' },
              ],
            },
          ],
        })
      : Response.json({ code: 'capability_unavailable' }, { status: 422 }),
  );
  restore = () => f.restore();
  await screen.findByRole('option', { name: 'CV (PDF)' });
  expect(screen.queryByRole('option', { name: 'Lebenslauf' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Applications' } });
  fireEvent.change(screen.getByLabelText('Short name'), { target: { value: 'cv' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create upload area' }));
  await screen.findByRole('alert');
  expect(f.calls.find((call) => call.path.endsWith('/upload-zones'))?.body).toMatchObject({
    template: 'cv-en',
  });
  fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'cv-unscanned-en' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create upload area' }));
  await waitFor(() =>
    expect(f.calls.filter((call) => call.path.endsWith('/upload-zones'))).toHaveLength(2),
  );
  expect(f.calls.filter((call) => call.path.endsWith('/upload-zones'))[1]?.body).toMatchObject({
    template: 'cv-unscanned-en',
  });
  expect(
    uploadsError({
      code: 'validation_failed',
      errors: [{ code: 'capability_unavailable', path: 'scanRequired' }],
    }),
  ).toBe('uploads.scanUnavailable');
});
