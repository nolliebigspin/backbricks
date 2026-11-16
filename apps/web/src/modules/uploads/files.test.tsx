import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { moduleView, testProject } from '../../../test/module-view.tsx';
import { initI18n } from '../../i18n/index.ts';
import type { FileItem } from './api.ts';
import { FilesView } from './files.tsx';

let restore: (() => void) | undefined;
afterEach(() => {
  cleanup();
  restore?.();
});
const hostile = '<img src=x onerror=alert(1)>.pdf';
const file: FileItem = {
  id: 'file_1',
  zoneId: 'mod_zone',
  name: hostile,
  size: 1536,
  type: 'application/pdf',
  status: 'ready',
  scanStatus: 'not_scanned',
  previewable: false,
  expiresAt: null,
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
  isTest: false,
  owner: null,
};
function mount(role: 'member' | 'admin' = 'admin', delayedDownload = false) {
  const f = moduleView(
    <FilesView />,
    ({ path, request }) => {
      if (path.endsWith('/download-url') && delayedDownload)
        return new Promise<Response>((_, reject) =>
          request.signal.addEventListener('abort', () => reject(request.signal.reason)),
        );
      if (path.endsWith('/download-url'))
        return Response.json({
          url: 'https://storage.example/private',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      if (path.endsWith('/storage-usage'))
        return Response.json({
          count: '1',
          storedBytes: '9007199254740993',
          reservedBytes: '1536',
        });
      if (path.endsWith('/upload-zones'))
        return Response.json({ data: [{ id: 'mod_zone', name: 'CV' }], nextCursor: null });
      if (request.method === 'DELETE') return new Response(null, { status: 204 });
      if (path.endsWith('/file_1')) return Response.json({ ...file, metadata: { note: hostile } });
      return Response.json({ data: [file], nextCursor: null });
    },
    role,
  );
  restore = () => f.restore();
  return f;
}
test('Files shares table/grid selection, confirms deletion and preserves exact capacity values', async () => {
  await initI18n('en');
  const f = mount();
  await screen.findByText(hostile);
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelector('data[value="9007199254740993"]')).not.toBeNull();
  fireEvent.click(screen.getByLabelText(`Select ${hostile}`));
  fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
  expect(screen.getByLabelText<HTMLInputElement>(`Select ${hostile}`).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
  expect(f.calls.some((call) => call.request.method === 'DELETE')).toBe(false);
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
  );
  await waitFor(() => expect(f.calls.some((call) => call.request.method === 'DELETE')).toBe(true));
});
test('members see unsafe names as text, no bulk action and no PDF preview', async () => {
  await initI18n('en');
  mount('member');
  fireEvent.click(await screen.findByRole('button', { name: `Open ${hostile}` }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(await dialog.findByRole('button', { name: 'Download' })).toBeDefined();
  expect(dialog.queryByRole('button', { name: 'Preview image' })).toBeNull();
  expect(screen.queryByLabelText(`Select ${hostile}`)).toBeNull();
  expect(document.querySelector('img')).toBeNull();
});
test('filter changes clear selections and submit literal names in the scoped request', async () => {
  await initI18n('de');
  const f = mount();
  fireEvent.click(await screen.findByLabelText(`${hostile} auswählen`));
  fireEvent.change(screen.getByLabelText('Dateinamen suchen'), { target: { value: '%_!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Suchen' }));
  await waitFor(() =>
    expect(f.calls.some((call) => new URL(call.request.url).searchParams.get('q') === '%_!')).toBe(
      true,
    ),
  );
  expect(screen.queryByRole('button', { name: 'Ausgewählte löschen (1)' })).toBeNull();
});
test('switching project aborts pending signed URL requests and clears the drawer and selection', async () => {
  await initI18n('en');
  const f = mount('admin', true);
  fireEvent.click(await screen.findByLabelText(`Select ${hostile}`));
  fireEvent.click(screen.getByRole('button', { name: `Open ${hostile}` }));
  fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
  await waitFor(() =>
    expect(f.calls.some((call) => call.path.endsWith('/download-url'))).toBe(true),
  );
  f.switchProject({ ...testProject, id: 'prj_other', organizationId: 'org_other' });
  await waitFor(() =>
    expect(
      f.calls.find((call) => call.path.endsWith('/download-url'))?.request.signal.aborted,
    ).toBe(true),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete selected (1)' })).toBeNull();
  expect(
    JSON.stringify(
      f.queries
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain('https://storage.example');
});
