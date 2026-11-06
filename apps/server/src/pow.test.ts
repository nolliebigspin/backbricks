import { expect, test } from 'bun:test';

import { createAltchaProvider, POW_COST, POW_TTL_SECONDS } from '@backbricks/adapters';
import { createPowReplayStore } from '@backbricks/db';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

import { available, scenario, AUTH_TEST_SECRET } from '../test/auth-fixture.ts';

test.skipIf(!available)(
  'ALTCHA proofs bind project/signature/expiry and consume one real atomic replay claim',
  async () => {
    await scenario(async (f) => {
      const clock = { now: f.now };
      const provider = createAltchaProvider({
        appSecret: AUTH_TEST_SECRET,
        clock,
        replay: createPowReplayStore(f.db),
      });
      const challenge = await provider.create({
        projectId: 'project-a',
        expiresAt: new Date(f.now().getTime() + POW_TTL_SECONDS * 1000),
      });
      const start = performance.now();
      const solution = await solveChallenge({ challenge, deriveKey, timeout: 10_000 });
      const duration = performance.now() - start;
      if (!solution) throw new Error('Proof solver timed out');
      expect(duration).toBeLessThan(10_000);
      expect(challenge.parameters.cost).toBe(POW_COST);
      const payload = { challenge, solution };
      expect(await provider.verify(payload, { projectId: 'project-b', now: f.now() })).toBe(false);
      expect(
        await provider.verify(
          {
            ...payload,
            challenge: { ...challenge, parameters: { ...challenge.parameters, cost: 1 } },
          },
          { projectId: 'project-a', now: f.now() },
        ),
      ).toBe(false);
      const other = createAltchaProvider({
        appSecret: 'another-test-only-secret-0000000000000000',
        clock,
        replay: createPowReplayStore(f.db),
      });
      expect(await other.verify(payload, { projectId: 'project-a', now: f.now() })).toBe(false);
      expect(
        await provider.verify(payload, {
          projectId: 'project-a',
          now: new Date(challenge.parameters.expiresAt * 1000),
        }),
      ).toBe(false);
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          provider.verify(payload, { projectId: 'project-a', now: f.now() }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await provider.verify(payload, { projectId: 'project-a', now: f.now() })).toBe(false);
      expect({
        ...challenge,
        signature: '[signature]',
        parameters: {
          ...challenge.parameters,
          nonce: '[nonce]',
          salt: '[salt]',
          expiresAt: '[expiry]',
        },
      }).toMatchSnapshot();
    });
  },
  30_000,
);
