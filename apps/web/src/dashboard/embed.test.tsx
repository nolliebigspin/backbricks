import { afterEach, expect, test } from 'bun:test';

import type { AdminOperations } from '@backbricks/sdk/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { initI18n } from '../i18n/index.ts';
import { TenantContext } from './context.tsx';
import { EmbedPage } from './embed.tsx';
import { ProjectShell } from './project-shell.tsx';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test('creation responses never enter Query caches and navigation unmounts the reveal', async () => {
  const project: AdminOperations['getProject']['responses'][200]['content']['application/json'] = {
    id: 'prj_test',
    organizationId: 'org_test',
    name: 'Website',
    slug: 'website',
    allowedOrigins: [],
    settings: {},
    createdAt: '2026-11-06T00:00:00Z',
    updatedAt: '2026-11-06T00:00:00Z',
  };
  const token = 'one-time-private-test-value';
  const fetcher: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method === 'POST')
        return Response.json(
          {
            id: 'key_test',
            name: 'Agent',
            kind: 'secret',
            displayPrefix: 'private',
            publicToken: null,
            scopes: [],
            expiresAt: null,
            revokedAt: null,
            lastUsedAt: null,
            createdAt: project.createdAt,
            token,
          },
          { status: 201 },
        );
      if (path.endsWith('/keys') || path === '/v1/projects')
        return Response.json({ data: path.endsWith('/keys') ? [] : [project], nextCursor: null });
      if (path.endsWith('/integration'))
        return Response.json({
          baseUrl: 'http://localhost/v1',
          project,
          publicKey: null,
          modules: [],
        });
      return Response.json(project);
    },
    { preconnect: originalFetch.preconnect },
  );
  globalThis.fetch = fetcher;
  await initI18n('en');
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <TenantContext value={{ organizationId: 'org_test', role: 'owner' }}>
        <ProjectShell projectId={project.id} />
      </TenantContext>
    ),
  });
  const embed = createRoute({ getParentRoute: () => root, path: '/', component: EmbedPage });
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    component: () => <p>Other page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([embed, other]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText('Name')).toBeDefined());
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Agent' } });
  fireEvent.change(screen.getByLabelText('Key type'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByLabelText('No expiration'));
  const form = screen.getByRole('button', { name: 'Create key' }).closest('form');
  if (!form) throw new Error('Missing key form');
  fireEvent.submit(form);
  await waitFor(() => expect(screen.getByDisplayValue(token)).toBeDefined());
  expect(
    JSON.stringify(
      queries
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain(token);
  expect(queries.getMutationCache().getAll()).toHaveLength(0);
  await router.navigate({ href: '/other' });
  await waitFor(() => expect(screen.queryByDisplayValue(token)).toBeNull());
  queries.clear();
});
