import { afterEach, expect, test } from 'bun:test';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { TenantContext, type Tenant } from '../../dashboard/context.tsx';
import { ProjectContext } from '../../dashboard/project-shell.tsx';
import type { Project } from '../../dashboard/projects.ts';
import { initI18n } from '../../i18n/index.ts';
import type { FormInstance } from './api.ts';
import { EmbedTab } from './embed.tsx';
import { configFields } from './entries-view.ts';
import { FieldsTab } from './fields.tsx';

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
const config = {
  fields: [
    { key: 'name', type: 'text', label: 'Name', required: true, maxLength: 500 },
    { key: 'message', type: 'textarea', label: 'Message', required: true, maxLength: 5000 },
  ],
  listFields: ['name', 'message'],
  spam: { proofOfWork: true, honeypotField: '_gotcha' },
  limits: {},
  retentionDays: 180,
};
const form: FormInstance = {
  id: 'mod_test',
  organizationId: 'org_test',
  projectId: 'prj_test',
  moduleType: 'forms',
  key: 'contact',
  name: 'Contact',
  status: 'active',
  config,
  configVersion: 3,
  moduleVersion: 1,
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};

type Call = { method: string; path: string; search: string; body: unknown };
/** The planned form's fields, read without trusting the request's shape. */
const fieldsOf = (body: unknown) => {
  const planned = ['config', 'modules', 'forms', 'contact', 'config'].reduce<unknown>(
    (value, key) => (typeof value === 'object' && value !== null ? Reflect.get(value, key) : null),
    body,
  );
  return configFields(planned);
};

function mount(
  role: Tenant['role'],
  ui: 'fields' | 'embed' = 'fields',
  publicKey: string | null = 'bb_pk_live',
) {
  const calls: Call[] = [];
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const body: unknown = request.method === 'GET' ? null : await request.clone().json();
      calls.push({ method: request.method, path: url.pathname, search: url.search, body });
      if (url.pathname.endsWith('/integration'))
        return Response.json({
          baseUrl: 'https://api.example.com/v1',
          project,
          publicKey,
          modules: [],
        });
      if (url.pathname.endsWith('/config') && request.method === 'GET')
        return Response.json({
          $schema: 'https://backbricks.app/schema/config.v1.json',
          project: 'prj_test',
          modules: {
            forms: {
              contact: {
                name: 'Contact',
                status: 'active',
                moduleVersion: 1,
                configVersion: 3,
                config,
              },
            },
          },
        });
      if (url.pathname.endsWith('/config')) {
        // The server's classifier: fewer fields means a removal, which is destructive.
        const destructive = fieldsOf(body).length < config.fields.length;
        return Response.json({
          changes: [
            {
              moduleType: 'forms',
              resource: 'forms',
              key: 'contact',
              kind: 'update',
              destructive,
              changedPaths: ['config'],
            },
          ],
          warnings: [],
          destructive,
          planHash: 'plan',
          expiresAt: '2026-11-12T00:10:00Z',
        });
      }
      return Response.json({ ...form, configVersion: 4 });
    },
    { preconnect: originalFetch.preconnect },
  );
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queries}>
      <TenantContext value={{ organizationId: 'org_test', role }}>
        <ProjectContext value={project}>
          {ui === 'fields' ? <FieldsTab form={form} /> : <EmbedTab form={form} />}
        </ProjectContext>
      </TenantContext>
    </QueryClientProvider>,
  );
  return calls;
}
const save = () => {
  const button = screen.getByRole('button', { name: 'Save changes' });
  const element = button.closest('form');
  if (!element) throw new Error('Missing fields form');
  fireEvent.submit(element);
};
const replaced = (calls: Call[]) =>
  calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/forms/contact'));

test('removing a field warns about "Additional data" and saves only after typing the form key', async () => {
  await initI18n('en');
  const calls = mount('admin');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Message' }));
  save();
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByText(
      /"Message" is removed\. Existing entries keep its answers under "Additional data"/,
    ),
  ).toBeDefined();
  expect(calls).toContainEqual(
    expect.objectContaining({
      method: 'PUT',
      path: '/v1/projects/prj_test/config',
      search: '?dryRun=true',
    }),
  );
  expect(replaced(calls)).toHaveLength(0);
  const confirm = within(dialog).getByRole('button', { name: 'Save changes' });
  expect(confirm.hasAttribute('disabled')).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('Type "contact" to confirm'), {
    target: { value: 'contact' },
  });
  fireEvent.click(confirm);
  await waitFor(() => expect(replaced(calls)).toHaveLength(1));
  expect(replaced(calls)[0]?.body).toEqual({
    configVersion: 3,
    config: { ...config, fields: [config.fields[0]], listFields: ['name'] },
  });
});

test('adding a common field saves without a confirmation and keeps the other rules', async () => {
  await initI18n('en');
  const calls = mount('admin');
  fireEvent.change(screen.getByLabelText('Add a field'), { target: { value: 'preset:email' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  expect(screen.getByLabelText('Short name', { selector: 'input:not([disabled])' })).toBeDefined();
  save();
  await waitFor(() => expect(replaced(calls)).toHaveLength(1));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(replaced(calls)[0]?.body).toEqual({
    configVersion: 3,
    config: {
      ...config,
      fields: [
        ...config.fields,
        { key: 'email', type: 'email', required: true, identifiesSubject: true, label: 'Email' },
      ],
    },
  });
});

test('members see the fields but cannot change them', async () => {
  await initI18n('en');
  mount('member');
  expect(screen.getByText(/Only owners and administrators can change the fields/)).toBeDefined();
  expect(screen.getByRole('button', { name: 'Remove Name' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(screen.queryByLabelText('Add a field')).toBeNull();
});

test('the embed tab fills in the publishable key and warns that plain HTML needs settings', async () => {
  await initI18n('en');
  mount('member', 'embed');
  expect(await screen.findByText(/\?key=bb_pk_live/)).toBeDefined();
  expect(
    screen.getByText(/Only these websites can send entries: https:\/\/example\.com/),
  ).toBeDefined();
  expect(screen.getByText(/This form checks for a real browser/)).toBeDefined();
  expect(screen.getByText(/Set a page for after sending/)).toBeDefined();
});

test('the embed tab shows a placeholder and a hint when no publishable key exists', async () => {
  await initI18n('de');
  mount('member', 'embed', null);
  expect(await screen.findByText(/noch keinen öffentlichen Schlüssel/)).toBeDefined();
  expect(screen.getByText(/\?key=YOUR_PUBLISHABLE_KEY/)).toBeDefined();
});
