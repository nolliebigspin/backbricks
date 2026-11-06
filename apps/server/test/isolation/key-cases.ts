import { expect } from 'bun:test';

import { apiKeyCreationResponseSchema } from '@backbricks/core';

import { insertKeyFixture } from '../management-fixture.ts';
import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Key rows in sibling and foreign projects prove both parent and child scoping. */
export async function keyIsolationCases(f: IsolationFixture): Promise<Cases> {
  const own = await insertKeyFixture(f.db, f.a1, crypto.getRandomValues(new Uint8Array(32)), [
    'stats:read',
  ]);
  const sibling = await insertKeyFixture(f.db, f.a2, crypto.getRandomValues(new Uint8Array(32)), [
    'stats:read',
  ]);
  const foreign = await insertKeyFixture(f.db, f.b1, crypto.getRandomValues(new Uint8Array(32)), [
    'stats:read',
  ]);
  const path = `/v1/projects/${f.a1.id}/keys`;
  const foreignPath = `/v1/projects/${f.b1.id}/keys`;
  const body = { kind: 'secret', name: 'Isolation key', preset: 'agent', expiresAt: null };
  return {
    'key.list': {
      kind: 'collection',
      read: { path, cookie: f.owner.cookie },
      present: [own.id],
      absent: [sibling.id, foreign.id],
      foreign: { path: foreignPath, cookie: f.owner.cookie },
    },
    'key.create': {
      kind: 'creation',
      successStatus: 201,
      denied: [
        { request: { path: foreignPath, body, cookie: f.owner.cookie }, status: 404 },
        { request: { path, body, cookie: f.member.cookie }, status: 403 },
        {
          request: { path, body: { ...body, organizationId: f.foreignId }, cookie: f.owner.cookie },
          status: 422,
        },
      ],
      allowed: { path, body, cookie: f.admin.cookie },
      verify: async (response) => {
        const key = apiKeyCreationResponseSchema.parse(await response.json());
        expect(key.publicToken).toBeNull();
        expect(key.scopes).not.toContain('data:read');
        const list = await f.request(path, undefined, f.owner.cookie);
        const text = await list.text();
        expect(text).toContain(key.id);
        expect(text).not.toContain(key.token);
      },
    },
    'key.revoke': {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        {
          request: {
            path: `${foreignPath}/${foreign.id}`,
            method: 'DELETE',
            cookie: f.owner.cookie,
          },
          status: 404,
        },
        {
          request: { path: `${path}/${foreign.id}`, method: 'DELETE', cookie: f.owner.cookie },
          status: 404,
        },
        {
          request: { path: `${path}/${sibling.id}`, method: 'DELETE', cookie: f.owner.cookie },
          status: 404,
        },
        {
          request: { path: `${path}/${own.id}`, method: 'DELETE', cookie: f.member.cookie },
          status: 403,
        },
      ],
      allowed: { path: `${path}/${own.id}`, method: 'DELETE', cookie: f.admin.cookie },
    },
  };
}
