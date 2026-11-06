import { expect, test } from 'bun:test';

import { defineModuleCatalog, monthlyUsagePeriod } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { available, scenario } from '../test/auth-fixture.ts';
import { counterModule } from '../test/http-module-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

const catalog = defineModuleCatalog([counterModule()]);
test.skipIf(!available)(
  'module HTTP hooks enforce tenant/role/scope/body policy and registered jobs share real transactions',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const path = `/v1/projects/${f.a1.id}/counters/demo/counts`;
        const read = () => f.request(`${path}?scale=2`, undefined, f.member.cookie);
        const readBody = async () => (await read()).json();
        expect(await readBody()).toEqual({ total: '0', scale: 2 });
        const created = await f.request(path, { amount: '3' }, f.owner.cookie);
        expect(created.status).toBe(201);
        expect(created.headers.get('cache-control')).toBe('no-store');
        expect(await created.json()).toEqual({ saved: '3' });
        const before = await f.snapshot();
        expect((await f.request(path, { amount: '9' }, f.member.cookie)).status).toBe(403);
        expect(
          (
            await f.request(
              `/v1/projects/${f.b1.id}/counters/demo/counts`,
              { amount: '9' },
              f.owner.cookie,
            )
          ).status,
        ).toBe(404);
        expect((await f.request(path, { amount: 'x' }, f.owner.cookie)).status).toBe(422);
        expect(
          (await f.request(path, { amount: '3', padding: 'x'.repeat(200) }, f.owner.cookie)).status,
        ).toBe(413);
        expect(await f.snapshot()).toEqual(before);
        const key = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Module fixture',
          scopes: ['counter:write'],
          expiresAt: null,
        });
        const headers = { authorization: `Bearer ${key.token}` };
        expect((await f.request(path, { amount: '2' }, undefined, headers)).status).toBe(201);
        expect((await f.request(path, undefined, undefined, headers)).status).toBe(403);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a2.id}/counters/demo/counts`,
              { amount: '9' },
              undefined,
              headers,
            )
          ).status,
        ).toBe(404);
        expect(await readBody()).toEqual({ total: '5', scale: 2 });
        expect((await f.request('/v1/public/counters/demo/summary')).status).toBe(503);
        const inventory = f.manifest().filter((route) => route.path.includes('/counters/'));
        expect(
          inventory
            .filter((route) => route.policy.kind === 'management')
            .map((route) => (route.policy.kind === 'management' ? route.policy.isolationCase : '')),
        ).toEqual(['counter.increment', 'counter.read']);
        const document = await f.request('/v1/openapi.json');
        expect(document.status).toBe(200);
        expect(await document.text()).toContain('counter.increment');
        const job = f.jobs()[0];
        if (!job) throw new Error('Expected worker registration');
        expect(job).toMatchObject({
          name: 'counter.increment',
          moduleType: 'counter',
          retries: 2,
          retentionSeconds: 3600,
        });
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        await job.run(context, { amount: '4' });
        expect(await readBody()).toEqual({ total: '9', scale: 2 });
        await f.db.execute(
          "alter table audit_logs add constraint fixture_module_http_failure check (action not in ('counter.fail', 'counter.job_completed')) not valid",
        );
        const failureBefore = await f.snapshot();
        expect((await f.request(path, { amount: '100', fail: true }, f.owner.cookie)).status).toBe(
          500,
        );
        const failedJob = await job
          .run(context, { amount: '100' })
          .catch((error: unknown) => error);
        expect(failedJob).toMatchObject({ cause: { code: '23514' } });
        expect(await f.snapshot()).toEqual(failureBefore);
        expect(await readBody()).toEqual({ total: '9', scale: 2 });
        expect(
          await createWithTenant(f.db)({ organizationId: f.foreignId, projectId: f.b1.id }, (tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          ),
        ).toEqual([]);
      },
      { BACKBRICKS_MODULES: 'counter' },
      { catalog },
    );
  },
);

test.skipIf(!available)(
  'module route declarations cannot shadow the host tenant selector',
  async () => {
    const module = counterModule();
    const route = module.adminRoutes[0];
    if (!route) throw new Error('Expected fixture route');
    const invalid = defineModuleCatalog([
      { ...module, adminRoutes: [{ ...route, path: '/{projectId}/counts' }] },
    ]);
    const failure = await scenario(
      async () => {},
      { BACKBRICKS_MODULES: 'counter' },
      { catalog: invalid },
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'A module route cannot shadow a tenant selector.' });
  },
);
