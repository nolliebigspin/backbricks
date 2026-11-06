import { expect, test } from 'bun:test';

import { altchaChallengeSchema } from '@backbricks/adapters';
import {
  hashApiKey,
  secretKeyReferenceSchema,
  type SecretKeyLookup,
  type SecretKeyReference,
} from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'challenge HTTP validates scoped credentials, origin, output and bounded generation',
  async () => {
    const directory = new Map<string, SecretKeyReference>();
    const lookup: SecretKeyLookup = (hash) =>
      Promise.resolve(directory.get(Buffer.from(hash).toString('hex')) ?? null);
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const pk = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Public fixture',
          expiresAt: null,
        });
        directory.set(
          Buffer.from(await hashApiKey(pk.token)).toString('hex'),
          secretKeyReferenceSchema.parse({
            id: pk.id,
            organizationId: f.organizationId,
            projectId: f.a1.id,
          }),
        );
        const headers = { authorization: `Bearer ${pk.token}` };
        const challenge = await f.request('/v1/public/challenge', undefined, undefined, headers);
        expect(challenge.status).toBe(200);
        const value = altchaChallengeSchema.parse(await challenge.json());
        expect(JSON.stringify(value)).not.toContain(f.a1.id);
        expect(JSON.stringify(value)).not.toContain(f.organizationId);
        expect({
          ...value,
          signature: '[signature]',
          parameters: {
            ...value.parameters,
            nonce: '[nonce]',
            salt: '[salt]',
            expiresAt: '[expiry]',
          },
        }).toMatchSnapshot();
        expect(challenge.headers.get('cache-control')).toBe('no-store');
        expect((await f.request(`/v1/public/challenge?key=${pk.token}`)).status).toBe(200);
        expect((await f.request('/v1/public/challenge')).status).toBe(401);
        expect(
          (
            await f.request('/v1/public/challenge', undefined, undefined, {
              authorization: `Bearer bb_pk_${'A'.repeat(32)}`,
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await f.request('/v1/public/challenge', undefined, undefined, {
              ...headers,
              origin: 'null',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}`,
              { allowedOrigins: ['https://allowed.test'] },
              f.owner.cookie,
              undefined,
              'PATCH',
            )
          ).status,
        ).toBe(200);
        expect(
          (await f.request('/v1/public/challenge', undefined, undefined, headers)).status,
        ).toBe(403);
        expect(
          (
            await f.request('/v1/public/challenge', undefined, undefined, {
              ...headers,
              origin: 'https://allowed.test',
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}/keys/${pk.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect(
          (await f.request('/v1/public/challenge', undefined, undefined, headers)).status,
        ).toBe(404);
        const responses = await Promise.all(
          Array.from({ length: 25 }, () =>
            f.request('/v1/public/challenge', undefined, undefined, headers),
          ),
        );
        expect(responses.some((response) => response.status === 429)).toBe(true);
      },
      {},
      { lookupPublishable: lookup },
    );
  },
  30_000,
);
