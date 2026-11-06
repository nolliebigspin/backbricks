import { expect } from 'bun:test';

import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Project-scoped config read/planning are side-effect-free even when the registry is empty. */
export function configurationIsolationCases(f: IsolationFixture): Cases {
  const path = `/v1/projects/${f.a1.id}/config`;
  const foreign = `/v1/projects/${f.b1.id}/config`;
  let before: Awaited<ReturnType<typeof f.snapshot>> | undefined;
  return {
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
