import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { moduleView } from '../../../test/module-view.tsx';
import { initI18n } from '../../i18n/index.ts';
import { EntryFiles } from './entry-files.tsx';
import { fieldTypes } from './fields-config.ts';
let restore: (() => void) | undefined;
afterEach(() => {
  cleanup();
  restore?.();
});
const attachment = {
  id: 'file_1',
  zoneId: 'mod_zone',
  name: '<script>alert(1)</script>.pdf',
  size: 123,
  type: 'application/pdf',
  status: 'ready' as const,
  scanStatus: 'clean' as const,
  previewable: false,
  expiresAt: null,
};
test('owner-bound attachments are text, missing files are explained without lookups, and download is audited', async () => {
  await initI18n('en');
  const f = moduleView(
    <EntryFiles value={['file_1', 'file_missing']} attachments={[attachment]} />,
    () => Response.json({ code: 'not_found' }, { status: 404 }),
    'member',
  );
  restore = () => f.restore();
  expect(screen.getByText(attachment.name)).toBeDefined();
  expect(screen.getByText(/expired, was deleted/)).toBeDefined();
  expect(screen.queryByText('file_missing')).toBeNull();
  expect(document.querySelector('script')).toBeNull();
  expect(f.calls).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  await waitFor(() => expect(f.calls).toHaveLength(1));
  expect(f.calls[0]?.path).toBe('/v1/projects/prj_test/files/file_1/download-url');
  expect(f.calls[0]?.body).toEqual({ preview: false });
});
test('blocked files never offer a download and files are selectable only when uploads is available', async () => {
  await initI18n('de');
  const f = moduleView(
    <EntryFiles
      value={['file_1']}
      attachments={[{ ...attachment, status: 'quarantined', scanStatus: 'infected' }]}
    />,
    () => Response.json({}),
  );
  restore = () => f.restore();
  expect(screen.queryByRole('button', { name: 'Herunterladen' })).toBeNull();
  expect(fieldTypes(false)).not.toContain('file');
  expect(fieldTypes(true)).toContain('file');
  expect(f.calls).toHaveLength(0);
});
