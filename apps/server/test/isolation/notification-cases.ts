import { expect } from 'bun:test';

import { idResponseSchema } from '../auth-fixture.ts';
import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Configuration and member choices stay within the authorized project/organization. */
export async function notificationIsolationCases(f: IsolationFixture): Promise<Cases> {
  const root = `/v1/projects/${f.a1.id}/notification-rules`;
  const foreignRoot = `/v1/projects/${f.b1.id}/notification-rules`;
  const input = { eventType: 'forms.submission.created', recipientUserIds: [f.admin.id] };
  const seed = async (projectId: string, cookie: string, userId: string) => {
    const response = await f.request(
      `/v1/projects/${projectId}/notification-rules`,
      { ...input, recipientUserIds: [userId] },
      cookie,
    );
    expect(response.status).toBe(201);
    return idResponseSchema.parse(await response.json()).id;
  };
  const own = await seed(f.a1.id, f.owner.cookie, f.admin.id);
  const sibling = await seed(f.a2.id, f.owner.cookie, f.admin.id);
  const foreign = await seed(f.b1.id, f.other.cookie, f.other.id);
  return {
    'notifications.list': {
      kind: 'collection',
      read: { path: root, cookie: f.admin.cookie },
      present: [own],
      absent: [sibling, foreign],
      foreign: { path: foreignRoot, cookie: f.owner.cookie },
    },
    'notifications.options': {
      kind: 'collection',
      read: { path: `${root}/options`, cookie: f.admin.cookie },
      present: [f.admin.email],
      absent: [f.other.email],
      foreign: { path: `${foreignRoot}/options`, cookie: f.owner.cookie },
    },
    'notifications.create': {
      kind: 'creation',
      successStatus: 201,
      denied: [
        { request: { path: root, body: input, cookie: f.member.cookie }, status: 403 },
        { request: { path: foreignRoot, body: input, cookie: f.owner.cookie }, status: 404 },
      ],
      allowed: { path: root, body: input, cookie: f.admin.cookie },
      verify: async (response) => {
        expect(idResponseSchema.parse(await response.json()).id).toStartWith('ntf_');
      },
    },
    'notifications.update': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${root}/${own}`,
            method: 'PATCH',
            body: { enabled: false },
            cookie: f.member.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: `${root}/${foreign}`,
            method: 'PATCH',
            body: { enabled: false },
            cookie: f.admin.cookie,
          },
          status: 404,
        },
        {
          request: {
            path: `${root}/${sibling}`,
            method: 'PATCH',
            body: { enabled: false },
            cookie: f.admin.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${root}/${own}`,
        method: 'PATCH',
        body: { includeContent: true },
        cookie: f.admin.cookie,
      },
    },
    'notifications.delete': {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        {
          request: { path: `${root}/${own}`, method: 'DELETE', cookie: f.member.cookie },
          status: 403,
        },
        {
          request: { path: `${root}/${foreign}`, method: 'DELETE', cookie: f.admin.cookie },
          status: 404,
        },
        {
          request: { path: `${root}/${sibling}`, method: 'DELETE', cookie: f.admin.cookie },
          status: 404,
        },
      ],
      allowed: { path: `${root}/${own}`, method: 'DELETE', cookie: f.admin.cookie },
    },
  };
}
