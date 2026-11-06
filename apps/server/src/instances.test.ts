import { expect, test } from 'bun:test';

import { monthlyUsagePeriod } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog, sampleConfig } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const responseSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  status: z.string(),
  configVersion: z.number(),
  config: sampleConfig,
});

test.skipIf(!available)(
  'generic instances validate configs, merge patches, paginate and keep attributable revisions',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const root = `/v1/projects/${f.a1.id}/samples`;
        const create = () =>
          f.request(root, { key: 'contact', name: 'Private name' }, f.owner.cookie);
        const responses = await Promise.all([create(), create()]);
        expect(responses.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([201, 409]);
        const created = responses.find((r) => r.status === 201);
        if (!created) throw new Error('Expected instance');
        const first = responseSchema.parse(await created.json());
        expect(first.config).toEqual(sampleConfig.parse({}));
        expect(first.configVersion).toBe(1);
        const path = `${root}/contact`;
        const patch = (body: unknown) => f.request(path, body, f.admin.cookie, undefined, 'PATCH');
        expect(
          (
            await patch({
              configVersion: 1,
              config: { title: 'Private title', options: { caption: 'Private caption' } },
            })
          ).status,
        ).toBe(200);
        const updated = responseSchema.parse(
          await (await f.request(path, undefined, f.member.cookie)).json(),
        );
        expect(updated.config.options).toEqual({ enabled: true, caption: 'Private caption' });
        expect(updated.configVersion).toBe(2);
        expect(
          (
            await patch({
              configVersion: 2,
              config: { options: { caption: null } },
              status: 'paused',
            })
          ).status,
        ).toBe(200);
        const snapshot = () =>
          createWithTenant(f.db)(
            { organizationId: f.organizationId, projectId: f.a1.id },
            async ({ repositories: r }) => ({
              instance: await r.instances.get(first.id),
              revisions: await r.revisions.list(first.id, { limit: 100 }),
              audit: (await r.audit.list({ limit: 100 })).filter(
                (row) => row.targetId === first.id,
              ),
              events: (await r.events.pending(100)).filter((row) => row.subjectId === first.id),
              usage: await r.usage.list(monthlyUsagePeriod(f.now())),
            }),
          );
        const before = await snapshot();
        expect(before.instance.configVersion).toBe(3);
        expect(before.usage).toEqual([{ metric: 'sample.recomputed', value: 2n }]);
        expect(before.revisions.map((r) => r.configVersion).toSorted((a, b) => a - b)).toEqual([
          1, 2, 3,
        ]);
        expect(
          before.revisions.every((r) => r.actorId === f.owner.id || r.actorId === f.admin.id),
        ).toBe(true);
        expect(JSON.stringify({ audit: before.audit, events: before.events })).not.toContain(
          'Private',
        );
        expect((await patch({ configVersion: 3, status: 'paused' })).status).toBe(200);
        expect(await snapshot()).toEqual(before);
        expect((await patch({ configVersion: 2, name: 'Stale' })).status).toBe(409);
        expect((await patch({ configVersion: 3, config: { unknown: true } })).status).toBe(422);
        expect((await patch({ configVersion: 3, key: 'renamed' })).status).toBe(422);
        const writes = await Promise.all([
          patch({ configVersion: 3, name: 'Concurrent A' }),
          patch({ configVersion: 3, name: 'Concurrent B' }),
        ]);
        expect(writes.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([200, 409]);
        expect((await snapshot()).instance.configVersion).toBe(4);
        expect((await snapshot()).revisions).toHaveLength(4);
        expect(
          (await f.request(root, { key: 'second', name: 'Second' }, f.owner.cookie)).status,
        ).toBe(201);
        const page = z.object({ data: z.array(responseSchema), nextCursor: z.string().nullable() });
        const one = page.parse(
          await (await f.request(`${root}?limit=1`, undefined, f.owner.cookie)).json(),
        );
        expect(one.data).toHaveLength(1);
        expect(one.nextCursor).not.toBeNull();
        const two = page.parse(
          await (
            await f.request(`${root}?limit=1&cursor=${one.nextCursor}`, undefined, f.owner.cookie)
          ).json(),
        );
        expect(two.data).toHaveLength(1);
        expect(two.data[0]?.id).not.toBe(one.data[0]?.id);
        expect(two.nextCursor).toBeNull();
        const removed = await f.request(
          `${path}?configVersion=4`,
          undefined,
          f.owner.cookie,
          undefined,
          'DELETE',
        );
        expect(removed.status).toBe(204);
        expect((await f.request(path, undefined, f.owner.cookie)).status).toBe(404);
        expect((await snapshot()).instance.status).toBe('archived');
        expect((await snapshot()).revisions).toHaveLength(5);
        expect((await create()).status).toBe(409);
        expect((await patch({ configVersion: 5, status: 'active' })).status).toBe(404);
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog() },
    );
  },
  30_000,
);
