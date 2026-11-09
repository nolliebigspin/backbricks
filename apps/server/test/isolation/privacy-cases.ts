import { expect } from 'bun:test';

import { subjectErasureResponseSchema, subjectExportResponseSchema } from '@backbricks/core';

import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Subject requests reach only the authorized project and never another tenant's records. */
export function privacyIsolationCases(f: IsolationFixture): Cases {
  const body = { email: 'subject-fixture@example.invalid' };
  const cases = (operation: 'export' | 'delete', successStatus: 200 | 202) => {
    const own = `/v1/projects/${f.a1.id}/privacy/subject-${operation}`;
    return {
      kind: 'creation' as const,
      successStatus,
      denied: [
        { request: { path: own, body, cookie: f.member.cookie }, status: 403 },
        {
          request: {
            path: `/v1/projects/${f.b1.id}/privacy/subject-${operation}`,
            body,
            cookie: f.owner.cookie,
          },
          status: 404,
        },
      ] as const,
      allowed: { path: own, body, cookie: f.admin.cookie },
      verify: async (response: Response) => {
        const json: unknown = await response.json();
        if (operation === 'export')
          expect(subjectExportResponseSchema.parse(json).modules).toHaveProperty('forms');
        else expect(subjectErasureResponseSchema.parse(json).status).toBe('queued');
      },
    };
  };
  return { 'privacy.export': cases('export', 200), 'privacy.delete': cases('delete', 202) };
}
