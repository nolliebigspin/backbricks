import { altchaChallengeSchema } from '@backbricks/adapters';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

import type { IsolationFixture } from './isolation/setup.ts';
import { issueKey } from './platform-read-fixture.ts';

/** A form in project A1 with generous limits, so several submissions fit one test. */
export async function createFormFixture(
  f: IsolationFixture,
  key = 'contact',
  config: Record<string, unknown> = {},
) {
  const response = await f.request(
    `/v1/projects/${f.a1.id}/forms`,
    {
      key,
      name: 'Contact',
      config: {
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true, maxLength: 100 },
          { key: 'email', type: 'email', label: 'Email', required: true, identifiesSubject: true },
          { key: 'message', type: 'textarea', label: 'Message', required: true },
          { key: 'privacy', type: 'consent', label: 'Privacy', text: 'I agree.', version: '2' },
        ],
        limits: { perMinute: 200, perHour: 1000 },
        ...config,
      },
    },
    f.admin.cookie,
  );
  if (response.status !== 201) throw new Error(`Form setup failed: ${response.status}`);
  const publishable = await issueKey(f, f.a1.id, {
    kind: 'publishable',
    name: 'Website',
    expiresAt: null,
  });
  return { key, publishable: publishable.token };
}

/** Fetch and solve a real proof-of-work challenge for the project of `publishable`. */
export async function solvedProof(f: IsolationFixture, publishable: string) {
  const response = await f.request(`/v1/public/challenge?key=${publishable}`);
  if (response.status !== 200) throw new Error(`Challenge failed: ${response.status}`);
  const challenge = altchaChallengeSchema.parse(await response.json());
  const solution = await solveChallenge({ challenge, deriveKey, timeout: 10_000 });
  if (!solution) throw new Error('Proof solver timed out');
  return { challenge, solution };
}

export const validAnswers = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  message: 'Hello there',
  privacy: true,
};
