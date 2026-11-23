import { expect } from 'bun:test';

import { configPlanResponseSchema } from '@backbricks/core';

import { issueKey } from '../platform-read-fixture.ts';
import { createKeyProbes } from './keys.ts';
import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Project-scoped config read/planning are side-effect-free even when the registry is empty. */
export async function configurationIsolationCases(f: IsolationFixture): Promise<Cases> {
  const path = `/v1/projects/${f.a1.id}/config`;
  const foreign = `/v1/projects/${f.b1.id}/config`;
  let before: Awaited<ReturnType<typeof f.snapshot>> | undefined;
  const keys = createKeyProbes(f);
  const mcp = `/v1/projects/${f.a1.id}/mcp`;
  const foreignMcp = `/v1/projects/${f.b1.id}/mcp`;
  const origin = 'https://mcp-isolation.example.invalid';
  const [read, write, project, integration] = await Promise.all([
    keys.token(f.a1.id, 'config:read'),
    keys.token(f.a1.id, 'config:write'),
    keys.token(f.a1.id, 'project:write'),
    keys.token(f.a1.id, 'integration:read'),
  ]);
  return {
    'mcp.config.apply': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${foreignMcp}/config`,
            method: 'PUT',
            headers: auth(write),
            body: { config: { project: f.a1.id, modules: {} }, planHash: 'fixture' },
          },
          status: 404,
        },
        {
          request: {
            path: `${mcp}/config`,
            method: 'PUT',
            headers: auth(read),
            body: { config: { project: f.a1.id, modules: {} }, planHash: 'fixture' },
          },
          status: 403,
        },
      ],
      allowed: async () => {
        const credential = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'MCP plan fixture',
          scopes: ['config:read', 'config:write'],
          expiresAt: null,
        });
        const config = { project: f.a1.id, modules: {} };
        const headers = auth(credential.token);
        const planned = await f.request(
          `${path}?dryRun=true`,
          { config },
          undefined,
          headers,
          'PUT',
        );
        expect(planned.status).toBe(200);
        return {
          path: `${mcp}/config`,
          method: 'PUT',
          headers,
          body: { config, planHash: configPlanResponseSchema.parse(await planned.json()).planHash },
        };
      },
    },
    'mcp.origins.add': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${foreignMcp}/origins`,
            headers: auth(project),
            body: { origin },
          },
          status: 404,
        },
        {
          request: {
            path: `${mcp}/origins`,
            headers: auth(integration),
            body: { origin },
          },
          status: 403,
        },
      ],
      allowed: {
        path: `${mcp}/origins`,
        headers: auth(project),
        body: { origin },
      },
      verify: async (response) => {
        expect(await response.json()).toMatchObject({
          allowedOrigins: expect.arrayContaining([origin]),
        });
      },
    },
    'config.types': {
      kind: 'resource',
      own: { path: `/v1/projects/${f.a1.id}/types?lang=ts`, cookie: f.member.cookie },
      foreign: { path: `/v1/projects/${f.b1.id}/types?lang=ts`, cookie: f.owner.cookie },
    },
    'config.read': {
      kind: 'resource',
      own: { path, cookie: f.member.cookie },
      foreign: { path: foreign, cookie: f.owner.cookie },
    },
    'config.plan': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${foreign}?dryRun=true`,
            method: 'PUT',
            cookie: f.owner.cookie,
            body: { config: { project: f.b1.id, modules: {} } },
          },
          status: 404,
        },
        {
          request: {
            path: `${path}?dryRun=true`,
            method: 'PUT',
            cookie: f.owner.cookie,
            body: { config: { project: f.b1.id, modules: {} } },
          },
          status: 404,
        },
      ],
      allowed: async () => {
        before = await f.snapshot();
        return {
          path: `${path}?dryRun=true`,
          method: 'PUT',
          cookie: f.member.cookie,
          body: { config: { project: f.a1.id, modules: {} } },
        };
      },
      verify: async () => {
        if (!before) throw new Error('Expected pre-plan state');
        expect(await f.snapshot()).toEqual(before);
      },
    },
  };
}
