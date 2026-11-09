import { altchaChallengeSchema } from '@backbricks/adapters';
import { submissionAcceptedSchema } from '@backbricks/module-forms';
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
export async function solvedProof(
  f: IsolationFixture,
  publishable: string,
  headers?: Record<string, string>,
) {
  const response = await f.request(
    `/v1/public/challenge?key=${publishable}`,
    undefined,
    undefined,
    headers,
  );
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

/** Receive a real entry through the scoped server-to-server public API. */
export async function createSubmissionFixture(
  f: IsolationFixture,
  key: string,
  data: Record<string, unknown> = validAnswers,
) {
  const secret = await issueKey(f, f.a1.id, {
    kind: 'secret',
    name: 'Submission fixture',
    scopes: ['forms:submit'],
    expiresAt: null,
  });
  const response = await f.request(`/v1/public/forms/${key}/submissions`, { data }, undefined, {
    authorization: `Bearer ${secret.token}`,
  });
  if (response.status !== 200) throw new Error(`Submission setup failed: ${response.status}`);
  return submissionAcceptedSchema.parse(await response.json()).id;
}
