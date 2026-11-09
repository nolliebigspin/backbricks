import { expect } from 'bun:test';

import { instanceResponseSchema } from '@backbricks/core';

import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/**
 * Generic instance routes (ADR-0040) for any operational module: the test-only sample and
 * production modules (forms) join the same manifest-based isolation detector.
 */
export async function instanceIsolationCases(
  f: IsolationFixture,
  module: { type: string; plural: string } = { type: 'sample', plural: 'samples' },
): Promise<Cases> {
  const root = `/v1/projects/${f.a1.id}/${module.plural}`;
  const foreignRoot = `/v1/projects/${f.b1.id}/${module.plural}`;
  const siblingRoot = `/v1/projects/${f.a2.id}/${module.plural}`;
  const seed = async (path: string, key: string, cookie: string) => {
    const response = await f.request(path, { key, name: 'Fixture' }, cookie);
    expect(response.status).toBe(201);
    return instanceResponseSchema.parse(await response.json());
  };
  const own = await seed(root, 'contact', f.owner.cookie);
  const foreign = await seed(foreignRoot, 'foreign-only', f.other.cookie);
  const sibling = await seed(siblingRoot, 'sibling-only', f.owner.cookie);
  await seed(root, 'history', f.owner.cookie);
  return {
    [`${module.type}.instance.revisions`]: {
      kind: 'collection',
      read: { path: `${root}/history/revisions`, cookie: f.member.cookie },
      present: [],
      absent: [foreign.id, sibling.id],
      foreign: { path: `${foreignRoot}/foreign-only/revisions`, cookie: f.owner.cookie },
    },
    [`${module.type}.instance.revision`]: {
      kind: 'resource',
      own: { path: `${root}/history/revisions/1`, cookie: f.member.cookie },
      foreign: { path: `${root}/foreign-only/revisions/1`, cookie: f.owner.cookie },
    },
    [`${module.type}.instance.rollback`]: {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${foreignRoot}/foreign-only/revisions/1/rollback`,
            body: { configVersion: 1 },
            cookie: f.owner.cookie,
          },
          status: 404,
        },
        {
          request: {
            path: `${root}/history/revisions/1/rollback`,
            body: { configVersion: 1 },
            cookie: f.member.cookie,
          },
          status: 403,
        },
      ],
      allowed: {
        path: `${root}/history/revisions/1/rollback`,
        body: { configVersion: 1 },
        cookie: f.admin.cookie,
      },
    },
    [`${module.type}.instance.migrate`]: {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${foreignRoot}/foreign-only/migrate`,
            body: { configVersion: 1 },
            cookie: f.owner.cookie,
          },
          status: 404,
        },
        {
          request: {
            path: `${root}/history/migrate`,
            body: { configVersion: 2 },
            cookie: f.member.cookie,
          },
          status: 403,
        },
      ],
      allowed: {
        path: `${root}/history/migrate`,
        body: { configVersion: 2 },
        cookie: f.admin.cookie,
      },
    },
    [`${module.type}.instance.list`]: {
      kind: 'collection',
      read: { path: root, cookie: f.member.cookie },
      present: [own.id],
      absent: [foreign.id, sibling.id],
      foreign: { path: foreignRoot, cookie: f.owner.cookie },
    },
    [`${module.type}.instance.create`]: {
      kind: 'creation',
      successStatus: 201,
      denied: [
        {
          request: {
            path: foreignRoot,
            body: { key: 'denied', name: 'Denied' },
            cookie: f.owner.cookie,
          },
          status: 404,
        },
        {
          request: { path: root, body: { key: 'denied', name: 'Denied' }, cookie: f.member.cookie },
          status: 403,
        },
        {
          request: {
            path: root,
            body: { key: 'denied', name: 'Denied', projectId: f.b1.id },
            cookie: f.owner.cookie,
          },
          status: 422,
        },
      ],
      allowed: { path: root, body: { key: 'created', name: 'Created' }, cookie: f.admin.cookie },
      verify: async (response) => {
        expect(instanceResponseSchema.parse(await response.json()).projectId).toBe(f.a1.id);
      },
    },
    [`${module.type}.instance.read`]: {
      kind: 'resource',
      own: { path: `${root}/contact`, cookie: f.member.cookie },
      foreign: { path: `${root}/foreign-only`, cookie: f.owner.cookie },
    },
    [`${module.type}.instance.update`]: {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${foreignRoot}/foreign-only`,
            body: { configVersion: 1, name: 'Denied' },
            cookie: f.owner.cookie,
            method: 'PATCH',
          },
          status: 404,
        },
        {
          request: {
            path: `${root}/sibling-only`,
            body: { configVersion: 1, name: 'Denied' },
            cookie: f.owner.cookie,
            method: 'PATCH',
          },
          status: 404,
        },
        {
          request: {
            path: `${root}/contact`,
            body: { configVersion: 1, name: 'Denied' },
            cookie: f.member.cookie,
            method: 'PATCH',
          },
          status: 403,
        },
      ],
      allowed: {
        path: `${root}/contact`,
        body: { configVersion: 1, status: 'paused' },
        cookie: f.admin.cookie,
        method: 'PATCH',
      },
      verify: async (response) => {
        expect(instanceResponseSchema.parse(await response.json()).configVersion).toBe(2);
      },
    },
    [`${module.type}.instance.archive`]: {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        {
          request: {
            path: `${foreignRoot}/foreign-only?configVersion=1`,
            cookie: f.owner.cookie,
            method: 'DELETE',
          },
          status: 404,
        },
        {
          request: {
            path: `${root}/contact?configVersion=2`,
            cookie: f.member.cookie,
            method: 'DELETE',
          },
          status: 403,
        },
      ],
      allowed: {
        path: `${root}/contact?configVersion=2`,
        cookie: f.admin.cookie,
        method: 'DELETE',
      },
      verify: async () => {
        expect((await f.request(`${root}/contact`, undefined, f.owner.cookie)).status).toBe(404);
      },
    },
  };
}
