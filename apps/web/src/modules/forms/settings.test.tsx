import { afterEach, expect, test } from 'bun:test';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TenantContext, type Tenant } from '../../dashboard/context.tsx';
import { ProjectContext } from '../../dashboard/project-shell.tsx';
import type { Project } from '../../dashboard/projects.ts';
import { initI18n } from '../../i18n/index.ts';
import { moduleNavigation } from '../registry.ts';
import type { FormInstance } from './api.ts';
import { FormSettingsTab } from './settings.tsx';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const project: Project = {
  id: 'prj_test',
  organizationId: 'org_test',
  name: 'Website',
  slug: 'website',
  allowedOrigins: ['https://example.com'],
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
    fields: [{ key: 'message', type: 'textarea', label: 'Message', required: true }],
    spam: { honeypotField: '_gotcha', proofOfWork: true },
    limits: {},
    retentionDays: 180,
  },
  configVersion: 3,
  moduleVersion: 1,
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};

function mount(role: Tenant['role'], fetcher: (request: Request) => Promise<Response>) {
  globalThis.fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => fetcher(new Request(input, init)),
    { preconnect: originalFetch.preconnect },
  );
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queries}>
      <TenantContext value={{ organizationId: 'org_test', role }}>
        <ProjectContext value={project}>
          <FormSettingsTab form={form} />
        </ProjectContext>
      </TenantContext>
    </QueryClientProvider>,
  );
  return queries;
}

test('members see settings read-only and never request notification configuration', async () => {
  await initI18n('en');
  const paths: string[] = [];
  mount('member', async (request) => {
    paths.push(new URL(request.url).pathname);
    return Response.json(null);
  });
  expect(screen.getByText(/Only owners and administrators/)).toBeDefined();
  // A disabled fieldset disables every control inside it in browsers.
  expect(
    screen.getByLabelText('Delete entries after').closest('fieldset')?.hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(screen.queryByText('Email notifications')).toBeNull();
  expect(paths.filter((path) => path.includes('notification-rules'))).toEqual([]);
});

test('admins replace the full config with the current version and get a plain stale message', async () => {
  await initI18n('en');
  const writes: { method: string; body: unknown }[] = [];
  mount('admin', async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'PUT') {
      writes.push({ method: request.method, body: await request.json() });
      return Response.json(
        { type: 'about:blank', title: 'Conflict', status: 409, code: 'conflict' },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      );
    }
    if (path.endsWith('/options'))
      return Response.json({ events: [], recipients: [], emailAvailable: false });
    if (path.endsWith('/notification-rules')) return Response.json({ data: [], nextCursor: null });
    return Response.json({ total: 0, unread: 0, spam: 0 });
  });
  fireEvent.change(screen.getByLabelText('Delete entries after'), {
    target: { value: 'unlimited' },
  });
  expect(screen.getByText(/kept until you delete them/)).toBeDefined();
  fireEvent.click(screen.getByLabelText('Check that a real browser sends the form'));
  expect(screen.getByText('Less protected')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Page after a successful entry'), {
    target: { value: 'https://elsewhere.example/thanks' },
  });
  expect(screen.getByText(/isn't on one of your project's allowed domains/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.getByText(/Someone else changed this form/)).toBeDefined());
  expect(screen.getByRole('button', { name: 'Reload settings' })).toBeDefined();
  expect(writes).toEqual([
    {
      method: 'PUT',
      body: {
        configVersion: 3,
        config: {
          fields: [{ key: 'message', type: 'textarea', label: 'Message', required: true }],
          spam: { honeypotField: '_gotcha', proofOfWork: false },
          limits: {},
          retentionDays: null,
          redirects: { success: 'https://elsewhere.example/thanks' },
        },
      },
    },
  ]);
  await waitFor(() => expect(screen.getByText(/Email isn't set up/)).toBeDefined());
});

test('the Inbox appears only when forms is operational', () => {
  expect(moduleNavigation('prj_test', [])).toEqual([]);
  expect(
    moduleNavigation('prj_test', [{ type: 'forms', resourceName: { plural: 'forms' } }]),
  ).toEqual([{ type: 'forms', labelKey: 'forms.inbox', href: '/projects/prj_test/forms' }]);
});
