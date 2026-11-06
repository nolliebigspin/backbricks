import { afterEach, expect, test } from 'bun:test';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { initI18n } from '../i18n/index.ts';
import { TenantContext, type Tenant } from './context.tsx';
import { MembersPage } from './members.tsx';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function mount(role: Tenant['role'], queries: QueryClient) {
  return render(
    <QueryClientProvider client={queries}>
      <TenantContext value={{ organizationId: 'org_test', role }}>
        <MembersPage />
      </TenantContext>
    </QueryClientProvider>,
  );
}

test('members cannot request the personal member list or invitation fallback', async () => {
  let requests = 0;
  globalThis.fetch = Object.assign(
    async () => {
      requests++;
      return Response.json(null);
    },
    { preconnect: originalFetch.preconnect },
  );
  await initI18n('en');
  const queries = new QueryClient();
  mount('member', queries);
  expect(screen.getByRole('alert').textContent).toContain('Only owners');
  expect(screen.queryByLabelText('Email address')).toBeNull();
  expect(requests).toBe(0);
  queries.clear();
});

test('an authorized creator can copy and dismiss the same-origin no-SMTP invitation link', async () => {
  const link = 'http://localhost/accept-invitation?invitationId=private-test-invitation';
  const fetcher: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === 'POST')
        return Response.json({ id: 'private-test-invitation', invitationUrl: link });
      return Response.json(request.url.includes('list-members') ? { members: [], total: 0 } : []);
    },
    { preconnect: originalFetch.preconnect },
  );
  globalThis.fetch = fetcher;
  await initI18n('en');
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount('owner', queries);
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'invitee@example.test' },
  });
  const form = screen.getByRole('button', { name: 'Invite member' }).closest('form');
  if (!form) throw new Error('Missing invitation form');
  fireEvent.submit(form);
  await waitFor(() => expect(screen.getByDisplayValue(link)).toBeDefined());
  expect(screen.getByText('Email is unavailable.', { exact: false })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByDisplayValue(link)).toBeNull();
  queries.clear();
});
