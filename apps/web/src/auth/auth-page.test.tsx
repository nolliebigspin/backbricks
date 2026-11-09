import { afterEach, expect, test } from 'bun:test';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { initI18n } from '../i18n/index.ts';
import { AuthPage } from './auth-page.tsx';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.replaceState(null, '', '/');
});

function installation() {
  const fetcher: typeof fetch = Object.assign(
    async (input: string | URL | Request) =>
      Response.json(
        (typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
        ).includes('/get-session')
          ? null
          : { signupPolicy: 'invite_only', emailAvailable: false, passwordMinLength: 12 },
      ),
    { preconnect: originalFetch.preconnect },
  );
  globalThis.fetch = fetcher;
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

test('closed signup has no password form and German labels remain accessible', async () => {
  const client = installation();
  await initI18n('de');
  render(
    <QueryClientProvider client={client}>
      <AuthPage screen="signup" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Einladung'));
  expect(screen.queryByLabelText('Passwort')).toBeNull();
  expect(screen.getByRole('link', { name: 'Anmelden' })).toBeDefined();
  client.clear();
});

test('missing reset token is explained without rendering a password form', async () => {
  const client = installation();
  await initI18n('en');
  render(
    <QueryClientProvider client={client}>
      <AuthPage screen="reset" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('expired'));
  expect(screen.queryByLabelText('Password')).toBeNull();
  client.clear();
});
