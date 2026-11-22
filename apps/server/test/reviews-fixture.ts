import { instanceResponseSchema } from '@backbricks/core';

import { idResponseSchema } from './auth-fixture.ts';
import type { IsolationFixture } from './isolation/setup.ts';
import { issueKey } from './platform-read-fixture.ts';

export const reviewAnswers = {
  rating: 4,
  authorName: 'Ada Lovelace',
  title: 'Great service',
  body: 'Thanks for the help.',
  email: 'private-canary@example.com',
  fields: { company: 'Analytical Engines', reference: 'private-extra-canary' },
};

export async function createReviewFixture(f: IsolationFixture, key = 'testimonials', config = {}) {
  const collectionRoot = `/v1/projects/${f.a1.id}/review-collections`;
  const created = await f.request(
    collectionRoot,
    {
      key,
      name: 'Testimonials',
      config: {
        fields: [
          { key: 'company', label: 'Company', public: true },
          { key: 'reference', label: 'Reference' },
        ],
        ...config,
      },
    },
    f.owner.cookie,
  );
  if (created.status !== 201)
    throw new Error(`Collection setup failed: ${created.status} ${await created.text()}`);
  const collection = instanceResponseSchema.parse(await created.json());
  const secret = (
    await issueKey(f, f.a1.id, {
      kind: 'secret',
      name: 'Review fixture writer',
      scopes: ['reviews:submit'],
      expiresAt: null,
    })
  ).token;
  const publishable = await issueKey(f, f.a1.id, {
    kind: 'publishable',
    name: 'Review fixture reader',
    expiresAt: null,
  });
  const publicRoot = `/v1/public/review-collections/${key}`;
  const recordRoot = `/v1/projects/${f.a1.id}/reviews`;
  const submit = (data = reviewAnswers, headers: Record<string, string> = {}) =>
    f.request(`${publicRoot}/reviews`, { data }, undefined, {
      authorization: `Bearer ${secret}`,
      ...headers,
    });
  const seed = async (data = reviewAnswers) => {
    const response = await submit(data);
    if (response.status !== 200)
      throw new Error(`Review setup failed: ${response.status} ${await response.text()}`);
    return idResponseSchema.parse(await response.json()).id;
  };
  const moderate = (id: string, action: string) =>
    f.request(`${recordRoot}/${id}`, { action }, f.member.cookie, undefined, 'PATCH');
  return {
    collection,
    collectionRoot,
    publicRoot,
    recordRoot,
    secret,
    publishable,
    submit,
    seed,
    moderate,
  };
}
