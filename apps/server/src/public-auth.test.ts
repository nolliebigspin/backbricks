import { expect, test } from 'bun:test';

import { secretKeyReferenceSchema, type SecretKeyReference } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'publishable bootstrap candidates are rechecked against current scoped key and project state',
  async () => {
    let candidate: SecretKeyReference | null = null;
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const key = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Public fixture',
          expiresAt: null,
        });
        const other = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Other fixture',
          expiresAt: null,
        });
        const headers = { authorization: `Bearer ${key.token}` };
        const request = () => f.request('/v1/public/challenge', undefined, undefined, headers);
        const before = await f.snapshot();
        candidate = secretKeyReferenceSchema.parse({
          id: key.id,
          organizationId: f.foreignId,
          projectId: f.b1.id,
        });
        expect((await request()).status).toBe(404);
        candidate = secretKeyReferenceSchema.parse({
          id: key.id,
          organizationId: f.organizationId,
          projectId: f.a2.id,
        });
        expect((await request()).status).toBe(404);
        candidate = secretKeyReferenceSchema.parse({
          id: other.id,
          organizationId: f.organizationId,
          projectId: f.a1.id,
        });
        expect((await request()).status).toBe(404);
        expect(await f.snapshot()).toEqual(before);
        candidate = secretKeyReferenceSchema.parse({
          id: key.id,
          organizationId: f.organizationId,
          projectId: f.a1.id,
        });
        expect((await request()).status).toBe(200);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}/keys/${key.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        // Retain the stale, formerly valid bootstrap candidate to prove the scoped read closes the race.
        expect((await request()).status).toBe(404);
      },
      {},
      { lookupPublishable: () => Promise.resolve(candidate) },
    );
  },
  30000,
);
