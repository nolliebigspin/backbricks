import { expect } from 'bun:test';

import { projectErasureResponseSchema, projectResponseSchema } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Real project operations join the same manifest coverage as auth and the synthetic probes. */
export function projectIsolationCases(f: IsolationFixture): Cases {
  let createdId: string | undefined;
  const ownPath = `/v1/projects/${f.a1.id}`;
  const foreignPath = `/v1/projects/${f.b1.id}`;
  return {
    'project.list': {
      kind: 'collection',
      read: { path: '/v1/projects', cookie: f.owner.cookie },
      present: [f.a1.id, f.a2.id],
      absent: [f.b1.id, f.b2.id],
    },
    'project.create': {
      kind: 'creation',
      successStatus: 201,
      denied: [
        {
          request: {
            path: '/v1/projects',
            body: { name: 'Denied', slug: 'denied' },
            cookie: f.member.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: '/v1/projects',
            body: { name: 'Denied', slug: 'denied', organizationId: f.foreignId },
            cookie: f.owner.cookie,
          },
          status: 422,
        },
      ],
      allowed: {
        path: '/v1/projects',
        body: { name: 'Created project', slug: 'created-project' },
        cookie: f.owner.cookie,
      },
      verify: async (response) => {
        const project = projectResponseSchema.parse(await response.json());
        expect(project.organizationId).toBe(f.organizationId);
        createdId = project.id;
        const stored = await createWithTenant(f.db)(
          { organizationId: f.organizationId },
          ({ repositories }) => repositories.projects.get(project.id),
        );
        expect(stored.organizationId).toBe(f.organizationId);
      },
    },
    'project.read': {
      kind: 'resource',
      own: { path: ownPath, cookie: f.owner.cookie },
      foreign: { path: foreignPath, cookie: f.owner.cookie },
    },
    'project.update': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: foreignPath,
            method: 'PATCH',
            body: { name: 'Denied' },
            cookie: f.owner.cookie,
          },
          status: 404,
        },
        {
          request: {
            path: ownPath,
            method: 'PATCH',
            body: { name: 'Denied' },
            cookie: f.member.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: ownPath,
            method: 'PATCH',
            body: { organizationId: f.foreignId },
            cookie: f.owner.cookie,
          },
          status: 422,
        },
      ],
      allowed: {
        path: ownPath,
        method: 'PATCH',
        body: { allowedOrigins: ['HTTPS://EXAMPLE.COM:443/'] },
        cookie: f.admin.cookie,
      },
      verify: async (response) => {
        expect(projectResponseSchema.parse(await response.json()).allowedOrigins).toEqual([
          'https://example.com',
        ]);
      },
    },
    'project.archive': {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        { request: { path: foreignPath, method: 'DELETE', cookie: f.owner.cookie }, status: 404 },
        { request: { path: ownPath, method: 'DELETE', cookie: f.member.cookie }, status: 403 },
      ],
      allowed: () => {
        if (!createdId) throw new Error('Expected created project');
        return { path: `/v1/projects/${createdId}`, method: 'DELETE', cookie: f.admin.cookie };
      },
      verify: async () => {
        expect(
          (await f.request(`/v1/projects/${createdId}`, undefined, f.owner.cookie)).status,
        ).toBe(404);
        const list = await f.request('/v1/projects', undefined, f.owner.cookie);
        expect(await list.text()).not.toContain(createdId!);
      },
    },
    'project.erase': {
      kind: 'creation',
      successStatus: 202,
      denied: [
        {
          request: {
            path: '/v1/project-erasures',
            body: { projectId: f.a1.id, confirm: 'a1' },
            cookie: f.admin.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: '/v1/project-erasures',
            body: { projectId: f.b1.id, confirm: 'b1' },
            cookie: f.owner.cookie,
          },
          status: 404,
        },
      ],
      // Its own archived project, so the case does not depend on the archive case's order.
      allowed: async () => {
        const created = await f.request(
          '/v1/projects',
          { name: 'Erased later', slug: 'erased-later' },
          f.owner.cookie,
        );
        const { id } = projectResponseSchema.parse(await created.json());
        await f.request(`/v1/projects/${id}`, undefined, f.owner.cookie, undefined, 'DELETE');
        return {
          path: '/v1/project-erasures',
          body: { projectId: id, confirm: 'erased-later' },
          cookie: f.owner.cookie,
        };
      },
      verify: async (response) => {
        expect(projectErasureResponseSchema.parse(await response.json()).status).toBe('queued');
      },
    },
  };
}
