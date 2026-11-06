import { expect } from 'bun:test';

import { createWithTenant } from '@backbricks/db';

import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

const projectPath = (id: string) => `/v1/projects/${id}/principal-fixture`;

/** Fixture routes exercise the same registration, authorization and repository pipeline as real routes. */
export function apiIsolationCases(f: IsolationFixture): Cases {
  return {
    'fixture.principal': {
      kind: 'resource',
      own: { path: projectPath(f.a1.id), cookie: f.owner.cookie },
      foreign: { path: projectPath(f.b1.id), cookie: f.owner.cookie },
    },
    'fixture.projects': {
      kind: 'collection',
      read: { path: '/v1/projects', cookie: f.owner.cookie },
      present: [f.a1.id, f.a2.id],
      absent: [f.b1.id, f.b2.id],
    },
    'fixture.audit': {
      kind: 'resource',
      own: { path: `/v1/organizations/${f.organizationId}/audit-fixture`, cookie: f.owner.cookie },
      foreign: { path: `/v1/organizations/${f.foreignId}/audit-fixture`, cookie: f.owner.cookie },
    },
    'fixture.rename': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: projectPath(f.b1.id),
            body: { name: 'Denied foreign' },
            cookie: f.owner.cookie,
          },
          status: 404,
        },
        {
          request: {
            path: projectPath(f.a1.id),
            body: { name: 'Denied role' },
            cookie: f.member.cookie,
          },
          status: 403,
        },
      ],
      allowed: {
        path: projectPath(f.a1.id),
        body: { name: 'Isolation renamed' },
        cookie: f.owner.cookie,
      },
      verify: async () => {
        const project = await createWithTenant(f.db)(
          { organizationId: f.organizationId },
          ({ repositories }) => repositories.projects.get(f.a1.id),
        );
        expect(project.name).toBe('Isolation renamed');
      },
    },
  };
}
