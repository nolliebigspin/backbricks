import { expect, test } from 'bun:test';

import { createIds, systemClock } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'unsupported methods authenticate before Allow and do not reveal foreign tenant resources',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const path = `/v1/projects/${f.a1.id}`;
      const denied = await f.request(path, {}, undefined, undefined, 'PUT');
      expect(denied.status).toBe(401);
      expect(denied.headers.get('allow')).toBeNull();
      const foreign = await f.request(
        `/v1/projects/${f.b1.id}`,
        {},
        f.owner.cookie,
        undefined,
        'PUT',
      );
      expect(foreign.status).toBe(404);
      expect(foreign.headers.get('allow')).toBeNull();
      const missing = await f.request(
        `/v1/projects/${createIds(systemClock).generate('prj')}`,
        {},
        f.owner.cookie,
        undefined,
        'PUT',
      );
      expect(missing.status).toBe(404);
      const known = await f.request(path, {}, f.member.cookie, undefined, 'PUT');
      expect(known.status).toBe(405);
      expect(known.headers.get('allow')).toBe('DELETE, GET, HEAD, PATCH');
      expect(await known.json()).toMatchObject({ code: 'method_not_allowed', status: 405 });
      expect(known.headers.get('cache-control')).toBe('no-store');
      const key = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Method fixture',
        scopes: ['integration:read'],
        expiresAt: null,
      });
      expect(
        (await f.request(path, {}, undefined, { authorization: `Bearer ${key.token}` }, 'PUT'))
          .status,
      ).toBe(405);
      expect(
        (
          await f.request(
            `/v1/projects/${f.a2.id}`,
            {},
            undefined,
            { authorization: `Bearer ${key.token}` },
            'PUT',
          )
        ).status,
      ).toBe(404);
      const publicMethod = await f.request('/v1/meta', {}, undefined, undefined, 'PUT');
      expect(publicMethod.status).toBe(405);
      expect(publicMethod.headers.get('allow')).toBe('GET, HEAD');
      expect((await f.request('/v1/unknown', {}, f.owner.cookie, undefined, 'PUT')).status).toBe(
        404,
      );
    });
  },
  15_000,
);
