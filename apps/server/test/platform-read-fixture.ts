import {
  apiKeyCreationResponseSchema,
  createAuditService,
  createIds,
  type ApiKeyCreate,
  type AuditMutation,
  type Project,
  type Clock,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import type { IsolationFixture } from './isolation/setup.ts';

/** Real creation endpoint; all grants/expiry are explicit in each fixture call. */
export async function issueKey(f: IsolationFixture, projectId: string, input: ApiKeyCreate) {
  const response = await f.request(`/v1/projects/${projectId}/keys`, input, f.owner.cookie);
  if (response.status !== 201) throw new Error(`Expected fixture key creation: ${response.status}`);
  return apiKeyCreationResponseSchema.parse(await response.json());
}

/** Trusted fixture setup goes through the same scoped transaction and audit metadata validator. */
export function recordActivity(
  f: IsolationFixture,
  project: Pick<Project, 'organizationId' | 'id'>,
  input: AuditMutation,
  clock: Clock = { now: f.now },
) {
  return createWithTenant(f.db)(
    { organizationId: project.organizationId, projectId: project.id },
    (tx) => createAuditService({ clock, ids: createIds(clock) }).record(tx, input),
  );
}
