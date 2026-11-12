import { afterEach, expect, test } from 'bun:test';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { TenantContext, type Tenant } from '../../dashboard/context.tsx';
import { ProjectContext } from '../../dashboard/project-shell.tsx';
import type { Project } from '../../dashboard/projects.ts';
import { initI18n } from '../../i18n/index.ts';
import type { FormInstance } from './api.ts';
import { EntriesTab } from './entries.tsx';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const hostile = '<img src=x onerror="alert(1)">';
const project: Project = {
  id: 'prj_test',
  organizationId: 'org_test',
  name: 'Website',
  slug: 'website',
  allowedOrigins: [],
  settings: {},
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};
const form: FormInstance = {
  id: 'mod_test',
  organizationId: 'org_test',
  projectId: 'prj_test',
  moduleType: 'forms',
  key: 'contact',
  name: 'Contact',
  status: 'active',
  config: {
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true },
      { key: 'message', type: 'textarea', label: 'Message', required: true },
    ],
  },
  configVersion: 1,
  moduleVersion: 1,
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};
const entry = {
  id: 'sub_1',
  configVersion: 1,
  createdAt: '2026-11-09T08:00:00Z',
  updatedAt: '2026-11-09T08:00:00Z',
  status: 'open',
  read: false,
  spamVerdict: 'clean',
  isTest: false,
  data: { name: hostile, message: 'Hello' },
};
const detail = {
  ...entry,
  fields: [
    { key: 'name', type: 'text', label: 'Name', required: true },
    { key: 'message', type: 'textarea', label: 'Message', required: true },
  ],
  additionalData: { legacy: hostile },
  source: { uaFamily: 'firefox' },
  spamReasons: [],
  expiresAt: '2027-05-08T08:00:00Z',
};

type Call = { method: string; path: string; body: unknown; signal: AbortSignal };
function mount(role: Tenant['role'], respond?: (call: Call) => Promise<Response> | undefined) {
  const calls: Call[] = [];
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const call = {
        method: request.method,
        path: new URL(request.url).pathname,
        body: request.method === 'GET' ? null : await request.clone().json(),
        signal: request.signal,
      };
      calls.push(call);
      const custom = respond?.(call);
      if (custom) return custom;
      if (call.path.endsWith('/submissions/sub_1') && call.method === 'GET')
        return Response.json(detail);
      if (call.path.endsWith('/submissions'))
        return Response.json({ data: [entry], nextCursor: null });
      return Response.json({ id: 'sub_1', count: 1 });
    },
    { preconnect: originalFetch.preconnect },
  );
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queries}>
      <TenantContext value={{ organizationId: 'org_test', role }}>
        <ProjectContext value={project}>
          <EntriesTab form={form} />
        </ProjectContext>
      </TenantContext>
    </QueryClientProvider>,
  );
  return { calls, queries, view };
}

test('hostile values stay text in the list and the drawer, and opening marks the entry read', async () => {
  await initI18n('en');
  const { calls, view } = mount('member');
  await waitFor(() => expect(screen.getAllByText(hostile).length).toBeGreaterThan(0));
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.queryByText('Download as spreadsheet (CSV)')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Open the entry/ }));
  const drawer = await screen.findByRole('dialog');
  await waitFor(() => expect(within(drawer).getByText('Additional data')).toBeDefined());
  expect(within(drawer).getAllByText(hostile)).toHaveLength(2);
  expect(document.querySelector('img')).toBeNull();
  await waitFor(() =>
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'PATCH', body: { read: true } }),
    ),
  );
});

test('members get no bulk delete; admins must type the form name to bulk delete', async () => {
  await initI18n('en');
  const member = mount('member');
  fireEvent.click(await screen.findByLabelText(/Select the entry/));
  expect(screen.getByRole('button', { name: 'Mark as done' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Delete selected' })).toBeNull();
  member.queries.clear();
  cleanup();

  const { calls } = mount('admin');
  expect(await screen.findByText('Download as spreadsheet (CSV)')).toBeDefined();
  fireEvent.click(await screen.findByLabelText(/Select the entry/));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', {
    name: 'Delete selected',
  });
  expect(confirm.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Type "contact" to confirm'), {
    target: { value: 'contact' },
  });
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/projects/prj_test/forms/contact/submissions/bulk-delete',
        body: { ids: ['sub_1'] },
      }),
    ),
  );
});

test('switching organizations cancels in-flight entry queries', async () => {
  await initI18n('en');
  const { calls, queries } = mount('member', (call) =>
    call.path.endsWith('/submissions')
      ? new Promise<Response>((_, reject) =>
          call.signal.addEventListener('abort', () => reject(call.signal.reason)),
        )
      : undefined,
  );
  await waitFor(() => expect(calls.some((call) => call.path.endsWith('/submissions'))).toBe(true));
  // The dashboard shell cancels and removes every ['tenant', …] query before switching.
  await queries.cancelQueries({ queryKey: ['tenant'] });
  const list = calls.find((call) => call.path.endsWith('/submissions'));
  expect(list?.signal.aborted).toBe(true);
});
