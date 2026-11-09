import { expect, test } from 'bun:test';

import { instanceResponseSchema } from '@backbricks/core';
import { z } from 'zod';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const configSchema = z.record(z.string(), z.unknown());

test.skipIf(!available)(
  'a full config replace reaches null-valued settings that a merge patch would delete',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const path = `/v1/projects/${f.a1.id}/forms/${key}`;
      const read = async () =>
        instanceResponseSchema.parse(
          await (await f.request(path, undefined, f.admin.cookie)).json(),
        );
      const before = await read();
      const config = configSchema.parse(before.config);

      // Merge patch semantics (RFC 7396): null deletes the key, so the default comes back.
      const patched = await f.request(
        path,
        { configVersion: before.configVersion, config: { retentionDays: null } },
        f.admin.cookie,
        undefined,
        'PATCH',
      );
      expect(patched.status).toBe(200);
      expect(configSchema.parse((await read()).config)['retentionDays']).toBe(180);

      // A replace stores exactly the given config, with the same version precondition.
      const current = await read();
      const replace = (configVersion: number, cookie = f.admin.cookie) =>
        f.request(
          path,
          { configVersion, config: { ...config, retentionDays: null } },
          cookie,
          undefined,
          'PUT',
        );
      expect((await replace(current.configVersion, f.member.cookie)).status).toBe(403);
      expect((await replace(current.configVersion + 1)).status).toBe(409);
      const replaced = await replace(current.configVersion);
      expect(replaced.status).toBe(200);
      const after = await read();
      expect(after.configVersion).toBe(current.configVersion + 1);
      expect(configSchema.parse(after.config)['retentionDays']).toBeNull();
    });
  },
  30_000,
);
