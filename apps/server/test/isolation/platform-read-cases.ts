import { createAuditService, createIds, createUsageService } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Distinct fixture IDs/metrics make non-disclosure assertions independent of response shape. */
export async function platformReadIsolationCases(f: IsolationFixture): Promise<Cases> {
  const clock = { now: f.now };
  const audit = createAuditService({ clock, ids: createIds(clock) });
  const usage = createUsageService(clock);
  const withTenant = createWithTenant(f.db);
  const seed = async (project: { organizationId: string; id: string }, metric: string) =>
    withTenant({ organizationId: project.organizationId, projectId: project.id }, async (tx) => {
      await usage.increment(tx, { metric, delta: 1n });
      return audit.record(tx, {
        actorType: 'system',
        action: 'fixture.reads_seeded',
        targetType: 'project',
        targetId: project.id,
      });
    });
  const a1 = await seed(f.a1, 'fixture.owned');
  const a2 = await seed(f.a2, 'fixture.sibling');
  const b1 = await seed(f.b1, 'fixture.foreign');
  return {
    'activity.organization': {
      kind: 'collection',
      read: { path: `/v1/organizations/${f.organizationId}/audit-logs`, cookie: f.owner.cookie },
      present: [a1, a2],
      absent: [b1],
      foreign: { path: `/v1/organizations/${f.foreignId}/audit-logs`, cookie: f.owner.cookie },
    },
    'activity.project': {
      kind: 'collection',
      read: { path: `/v1/projects/${f.a1.id}/audit-logs`, cookie: f.owner.cookie },
      present: [a1],
      absent: [a2, b1],
      foreign: { path: `/v1/projects/${f.b1.id}/audit-logs`, cookie: f.owner.cookie },
    },
    'usage.project': {
      kind: 'collection',
      read: { path: `/v1/projects/${f.a1.id}/usage`, cookie: f.member.cookie },
      present: ['fixture.owned'],
      absent: ['fixture.sibling', 'fixture.foreign'],
      foreign: { path: `/v1/projects/${f.b1.id}/usage`, cookie: f.member.cookie },
    },
    'integration.project': {
      kind: 'resource',
      own: { path: `/v1/projects/${f.a1.id}/integration`, cookie: f.member.cookie },
      foreign: { path: `/v1/projects/${f.b1.id}/integration`, cookie: f.member.cookie },
    },
  };
}
