import { createFormFixture, createSubmissionFixture } from '../forms-fixture.ts';
import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Real entries in both organizations and sibling projects, reached with sessions and keys. */
export async function formsIsolationCases(f: IsolationFixture): Promise<Cases> {
  const seed = async (project: IsolationFixture['a1'], actor: IsolationFixture['owner']) => {
    const target = { ...f, a1: project, admin: actor, owner: actor };
    const form = await createFormFixture(target, 'inbox');
    const id = await createSubmissionFixture(target, form.key);
    return { root: `/v1/projects/${project.id}/forms/${form.key}`, id };
  };
  const own = await seed(f.a1, f.owner);
  const sibling = await seed(f.a2, f.owner);
  const foreign = await seed(f.b1, f.other);
  const deleteId = await createSubmissionFixture(f, 'inbox');
  const bulkIds = [
    await createSubmissionFixture(f, 'inbox'),
    await createSubmissionFixture(f, 'inbox'),
  ];
  const bulkDeleteIds = [
    await createSubmissionFixture(f, 'inbox'),
    await createSubmissionFixture(f, 'inbox'),
  ];
  return {
    'forms.submissions.update': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${own.root}/submissions/${foreign.id}`,
            body: { read: true },
            method: 'PATCH',
            cookie: f.member.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${own.root}/submissions/${own.id}`,
        body: { read: true },
        method: 'PATCH',
        cookie: f.member.cookie,
      },
    },
    'forms.submissions.delete': {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        {
          request: {
            path: `${own.root}/submissions/${foreign.id}`,
            method: 'DELETE',
            cookie: f.member.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${own.root}/submissions/${deleteId}`,
        method: 'DELETE',
        cookie: f.member.cookie,
      },
    },
    'forms.submissions.bulk': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${own.root}/submissions/bulk`,
            body: { ids: [bulkIds[0], foreign.id], action: 'done' },
            cookie: f.member.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${own.root}/submissions/bulk`,
        body: { ids: bulkIds, action: 'done' },
        cookie: f.member.cookie,
      },
    },
    'forms.submissions.bulk_delete': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${own.root}/submissions/bulk-delete`,
            body: { ids: bulkDeleteIds },
            cookie: f.member.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: `${own.root}/submissions/bulk-delete`,
            body: { ids: [bulkDeleteIds[0], foreign.id] },
            cookie: f.admin.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${own.root}/submissions/bulk-delete`,
        body: { ids: bulkDeleteIds },
        cookie: f.admin.cookie,
      },
    },
    'forms.submissions.delete_all': {
      kind: 'mutation',
      successStatus: 202,
      denied: [
        {
          request: {
            path: `${own.root}/submissions/delete-all`,
            body: { confirm: 'inbox' },
            cookie: f.member.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: `${foreign.root}/submissions/delete-all`,
            body: { confirm: 'inbox' },
            cookie: f.admin.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${own.root}/submissions/delete-all`,
        body: { confirm: 'inbox' },
        cookie: f.admin.cookie,
      },
    },
    'forms.summary': {
      kind: 'resource',
      own: { path: `${own.root}/summary`, cookie: f.member.cookie },
      foreign: { path: `${foreign.root}/summary`, cookie: f.owner.cookie },
    },
    'forms.submissions.list': {
      kind: 'collection',
      read: { path: `${own.root}/submissions`, cookie: f.member.cookie },
      present: [own.id],
      absent: [sibling.id, foreign.id],
      foreign: { path: `${foreign.root}/submissions`, cookie: f.owner.cookie },
    },
    'forms.submissions.read': {
      kind: 'resource',
      own: { path: `${own.root}/submissions/${own.id}`, cookie: f.member.cookie },
      foreign: { path: `${own.root}/submissions/${foreign.id}`, cookie: f.owner.cookie },
    },
  };
}
