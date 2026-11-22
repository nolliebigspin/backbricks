import { createReviewFixture } from '../reviews-fixture.ts';
import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

export async function reviewsIsolationCases(f: IsolationFixture): Promise<Cases> {
  const own = await createReviewFixture(f);
  const peer = await createReviewFixture({ ...f, a1: f.a2 }, 'sibling-reviews');
  const foreign = await createReviewFixture({ ...f, a1: f.b1, owner: f.other }, 'foreign-reviews');
  const id = await own.seed();
  const deleted = await own.seed();
  const peerId = await peer.seed();
  const foreignId = await foreign.seed();
  const cookie = f.member.cookie;
  const item = (target: string) => ({ path: `${own.recordRoot}/${target}`, cookie });
  return {
    'reviews.records.list': {
      kind: 'collection',
      read: { path: `${own.recordRoot}?collection=${own.collection.key}`, cookie },
      present: [id, deleted],
      absent: [peerId, foreignId],
      foreign: { path: `${own.recordRoot}?collection=${foreign.collection.key}`, cookie },
    },
    'reviews.records.read': { kind: 'resource', own: item(id), foreign: item(foreignId) },
    'reviews.records.moderate': {
      kind: 'mutation',
      denied: [
        { status: 404, request: { ...item(peerId), method: 'PATCH', body: { action: 'approve' } } },
        {
          status: 404,
          request: { ...item(foreignId), method: 'PATCH', body: { action: 'approve' } },
        },
      ],
      allowed: { ...item(id), method: 'PATCH', body: { action: 'approve' } },
    },
    'reviews.records.delete': {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        { status: 404, request: { ...item(peerId), method: 'DELETE' } },
        { status: 404, request: { ...item(foreignId), method: 'DELETE' } },
      ],
      allowed: { ...item(deleted), method: 'DELETE' },
    },
    'reviews.collection.stats': {
      kind: 'resource',
      own: { path: `${own.collectionRoot}/${own.collection.key}/stats`, cookie },
      foreign: { path: `${own.collectionRoot}/${foreign.collection.key}/stats`, cookie },
    },
  };
}
