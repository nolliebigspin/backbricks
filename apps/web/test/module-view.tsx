import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { TenantContext, type Tenant } from '../src/dashboard/context.tsx';
import { ProjectContext } from '../src/dashboard/project-shell.tsx';
import type { Project } from '../src/dashboard/projects.ts';

export const testProject: Project = {
  id: 'prj_test',
  organizationId: 'org_test',
  name: 'Website',
  slug: 'website',
  allowedOrigins: [],
  settings: {},
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};
export type ViewCall = { request: Request; path: string; body: unknown };
/** HTTP boundary fixture for component behavior; server integration uses real services separately. */
export function moduleView(
  content: ReactNode,
  respond: (call: ViewCall) => Response | Promise<Response>,
  role: Tenant['role'] = 'admin',
) {
  const calls: ViewCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const call = {
        request,
        path: new URL(request.url).pathname,
        body:
          request.method === 'GET' || request.method === 'DELETE'
            ? null
            : await request.clone().json(),
      };
      calls.push(call);
      return respond(call);
    },
    { preconnect: original.preconnect },
  );
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function tree(project = testProject) {
    return (
      <QueryClientProvider client={queries}>
        <TenantContext value={{ organizationId: project.organizationId, role }}>
          <ProjectContext value={project}>{content}</ProjectContext>
        </TenantContext>
      </QueryClientProvider>
    );
  }
  const view = render(tree());
  return {
    calls,
    queries,
    view,
    switchProject(project: Project) {
      view.rerender(tree(project));
    },
    restore() {
      queries.clear();
      globalThis.fetch = original;
    },
  };
}
