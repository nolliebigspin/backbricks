import { expect, test } from 'bun:test';

import { createAdminClient } from '@backbricks/sdk/admin';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'generated admin client creates and reads real scoped resources and receives typed denials',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const client = createAdminClient({
        baseUrl: f.origin,
        headers: { cookie: f.owner.cookie, origin: f.origin, 'x-backbricks-csrf': '1' },
      });
      const created = await client.POST('/v1/projects', {
        body: { name: 'Typed project', slug: 'typed-project' },
      });
      expect(created.response.status).toBe(201);
      if (!created.data) throw new Error('Expected typed project response');
      expect(created.data.name).toBe('Typed project');
      const read = await client.GET('/v1/projects/{projectId}', {
        params: { path: { projectId: created.data.id } },
      });
      expect(read.data?.id).toBe(created.data.id);
      const key = await client.POST('/v1/projects/{projectId}/keys', {
        params: { path: { projectId: created.data.id } },
        body: { kind: 'secret', name: 'Typed key', scopes: ['config:read'], expiresAt: null },
      });
      expect(key.response.status).toBe(201);
      expect(key.data?.token).toStartWith('bb_sk_');
      const denied = await client.GET('/v1/projects/{projectId}', {
        params: { path: { projectId: f.b1.id } },
      });
      expect(denied.response.status).toBe(404);
      expect(denied.error?.code).toBe('not_found');
    });
  },
  15_000,
);
