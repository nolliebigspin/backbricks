import { expect, test } from 'bun:test';

import { auditPageSchema, MILLISECONDS_PER_DAY } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey, recordActivity } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'activity reads filter and paginate scoped history without private identity/network fields',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const first = await recordActivity(f, f.a1, {
        actorType: 'system',
        actorId: 'actor_a',
        action: 'fixture.alpha',
        ipHash: new Uint8Array(32).fill(7),
        changes: { changedFields: ['name'] },
      });
      const second = await recordActivity(f, f.a1, {
        actorType: 'system',
        actorId: 'actor_a',
        action: 'fixture.alpha',
      });
      const beta = await recordActivity(f, f.a1, {
        actorType: 'system',
        actorId: 'actor_b',
        action: 'fixture.beta',
      });
      const sibling = await recordActivity(f, f.a2, {
        actorType: 'system',
        action: 'fixture.alpha',
      });
      const foreign = await recordActivity(f, f.b1, {
        actorType: 'system',
        action: 'fixture.alpha',
      });
      const expired = await recordActivity(
        f,
        f.a1,
        { actorType: 'system', action: 'fixture.expired' },
        { now: () => new Date(f.now().getTime() - 400 * MILLISECONDS_PER_DAY) },
      );
      const orgPath = `/v1/organizations/${f.organizationId}/audit-logs`;
      const projectPath = `/v1/projects/${f.a1.id}/audit-logs`;
      const before = await f.snapshot();
      const response = await f.request(
        `${orgPath}?projectId=${f.a1.id}&action=fixture.alpha&actorType=system&actorId=actor_a`,
        undefined,
        f.owner.cookie,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const page = auditPageSchema.parse(await response.json());
      expect(page.data.map((row) => row.id).toSorted()).toEqual([first, second].toSorted());
      expect(page.data.every((row) => !new Set<string>([beta, sibling, foreign]).has(row.id))).toBe(
        true,
      );
      const json = JSON.stringify(page);
      for (const field of ['ipHash', 'actorLabel', 'expiresAt', 'organizationId', 'email'])
        expect(json).not.toContain(field);
      expect(json).not.toContain(f.owner.email);
      expect(await f.snapshot()).toEqual(before);
      const all = auditPageSchema.parse(
        await (await f.request(projectPath, undefined, f.owner.cookie)).json(),
      );
      expect(all.data.some((row) => row.id === expired)).toBe(false);
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        // oxlint-disable-next-line no-await-in-loop -- Traverse only from the previous scoped cursor.
        const result = await f.request(
          `${projectPath}?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
          undefined,
          f.admin.cookie,
        );
        // oxlint-disable-next-line no-await-in-loop -- Decode the next position before fetching the next page.
        const next = auditPageSchema.parse(await result.json());
        ids.push(...next.data.map((row) => row.id));
        cursor = next.nextCursor;
      } while (cursor && ids.length <= all.data.length);
      expect(cursor).toBeNull();
      expect(ids).toEqual(all.data.map((row) => row.id));
      const fromB = auditPageSchema.parse(
        await (
          await f.request(
            `/v1/organizations/${f.foreignId}/audit-logs?limit=1`,
            undefined,
            f.other.cookie,
          )
        ).json(),
      );
      expect(fromB.nextCursor).toBeString();
      const crossCursor = auditPageSchema.parse(
        await (
          await f.request(`${orgPath}?cursor=${fromB.nextCursor}`, undefined, f.owner.cookie)
        ).json(),
      );
      expect(JSON.stringify(crossCursor)).not.toContain(foreign);
      expect(JSON.stringify(crossCursor)).not.toContain(f.other.id);
      const foreignFilter = auditPageSchema.parse(
        await (
          await f.request(`${orgPath}?projectId=${f.b1.id}`, undefined, f.owner.cookie)
        ).json(),
      );
      expect(foreignFilter.data).toEqual([]);
      expect(
        (await f.request(`${projectPath}?projectId=${f.b1.id}`, undefined, f.owner.cookie)).status,
      ).toBe(404);
      expect((await f.request(orgPath, undefined, f.member.cookie)).status).toBe(403);
      expect((await f.request(projectPath, undefined, f.member.cookie)).status).toBe(403);
      const key = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Read permissions',
        scopes: ['integration:read', 'stats:read'],
        expiresAt: null,
      });
      const headers = { authorization: `Bearer ${key.token}` };
      expect((await f.request(orgPath, undefined, f.owner.cookie, headers)).status).toBe(403);
      expect((await f.request(projectPath, undefined, f.owner.cookie, headers)).status).toBe(403);
      const invalid = [
        'action=.*',
        'actorType=admin',
        'actorId=someone%40example.invalid',
        'limit=101',
        'cursor=abc',
        `organizationId=${f.foreignId}`,
      ];
      const failures = await Promise.all(
        invalid.map((query) => f.request(`${orgPath}?${query}`, undefined, f.owner.cookie)),
      );
      expect(failures.every((result) => result.status === 422)).toBe(true);
      expect(
        (await f.request(`/v1/projects/${f.a1.id}`, undefined, f.owner.cookie, undefined, 'DELETE'))
          .status,
      ).toBe(204);
      expect((await f.request(projectPath, undefined, f.owner.cookie)).status).toBe(404);
      const archivedHistory = auditPageSchema.parse(
        await (
          await f.request(`${orgPath}?projectId=${f.a1.id}`, undefined, f.owner.cookie)
        ).json(),
      );
      expect(archivedHistory.data.some((row) => row.action === 'project.archived')).toBe(true);
      expect(archivedHistory.data.some((row) => row.id === first)).toBe(true);
    });
  },
  20_000,
);
