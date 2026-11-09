import { expect, test } from 'bun:test';

import {
  configDocumentSchema,
  configPlanResponseSchema,
  CONFIG_PLAN_TTL_MS,
} from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'config apply rejects invalid bindings and atomically serializes revisions, retention, audit and events',
  async () => {
    let now = new Date('2026-11-06T12:00:00Z').getTime();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const root = `/v1/projects/${f.a1.id}`;
        const path = `${root}/config`;
        expect(
          (await f.request(`${root}/samples`, { key: 'contact', name: 'Contact' }, f.owner.cookie))
            .status,
        ).toBe(201);
        const read = async () =>
          configDocumentSchema.parse(
            await (await f.request(path, undefined, f.owner.cookie)).json(),
          );
        const initial = await read();
        const contact = initial.modules['samples']?.['contact'];
        if (!contact) throw new Error('Expected config');
        const desired = {
          ...initial,
          modules: {
            samples: {
              contact: {
                ...contact,
                config: { title: 'Changed', fields: ['email'], options: { enabled: true } },
              },
              fresh: { name: 'Fresh', moduleVersion: 1, config: {} },
            },
          },
        };
        const plan = async (config: unknown, cookie = f.owner.cookie) => {
          const response = await f.request(
            `${path}?dryRun=true`,
            { config },
            cookie,
            undefined,
            'PUT',
          );
          expect(response.status).toBe(200);
          return configPlanResponseSchema.parse(await response.json());
        };
        const apply = (config: unknown, planHash?: string, cookie = f.owner.cookie) =>
          f.request(`${path}?dryRun=false`, { config, planHash }, cookie, undefined, 'PUT');
        const proposal = await plan(desired);
        const before = await f.snapshot();
        expect((await apply(desired)).status).toBe(409);
        expect((await apply(desired, `${proposal.planHash}0`)).status).toBe(409);
        expect((await apply(desired, proposal.planHash, f.admin.cookie)).status).toBe(409);
        expect((await apply({ ...desired, modules: {} }, proposal.planHash)).status).toBe(409);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a2.id}/config?dryRun=false`,
              { config: desired, planHash: proposal.planHash },
              f.owner.cookie,
              undefined,
              'PUT',
            )
          ).status,
        ).toBe(404);
        expect(await f.snapshot()).toEqual(before);
        await f.db.execute(
          "alter table events add constraint fixture_apply_failure check (type <> 'instance.created') not valid",
        );
        expect((await apply(desired, proposal.planHash)).status).toBe(500);
        expect(await f.snapshot()).toEqual(before);
        await f.db.execute('alter table events drop constraint fixture_apply_failure');
        const concurrent = await Promise.all([
          apply(desired, proposal.planHash),
          apply(desired, proposal.planHash),
        ]);
        expect(concurrent.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
          200, 409,
        ]);
        expect((await apply(desired, proposal.planHash)).status).toBe(409);
        const current = await read();
        const noop = await plan(current);
        const applied = await f.snapshot();
        expect((await apply(current, noop.planHash)).status).toBe(200);
        expect(await f.snapshot()).toEqual(applied);
        now += CONFIG_PLAN_TTL_MS;
        expect((await apply(current, noop.planHash)).status).toBe(409);
        expect(await f.snapshot()).toEqual(applied);
        const schema = await f.request('/v1/schema/config');
        expect(schema.status).toBe(200);
        expect(await schema.json()).toMatchSnapshot();
        const types = await f.request(`${root}/types?lang=ts`, undefined, f.owner.cookie);
        expect(types.status).toBe(200);
        expect(await types.text()).toContain('Sample_contact');
        const writer = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Writer',
          scopes: ['config:read', 'config:write'],
          expiresAt: null,
        });
        const headers = { authorization: `Bearer ${writer.token}` };
        const erase = { ...current, modules: { samples: {} } };
        const keyPlan = await f.request(
          `${path}?dryRun=true`,
          { config: erase },
          undefined,
          headers,
          'PUT',
        );
        expect(keyPlan.status).toBe(200);
        const token = configPlanResponseSchema.parse(await keyPlan.json()).planHash;
        const protectedBefore = await f.snapshot();
        expect(
          (
            await f.request(
              `${path}?dryRun=false`,
              { config: erase, planHash: token },
              undefined,
              headers,
              'PUT',
            )
          ).status,
        ).toBe(403);
        expect(await f.snapshot()).toEqual(protectedBefore);
        const approved = await plan(erase);
        expect((await apply(erase, approved.planHash)).status).toBe(200);
        expect((await read()).modules['samples']).toEqual({});
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog(), keyClock: { now: () => new Date(now) } },
    );
  },
  30_000,
);
