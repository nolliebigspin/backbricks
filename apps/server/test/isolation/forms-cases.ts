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
  return {
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
