import { expect, test } from 'bun:test';

import { configDocumentSchema, configPlanResponseSchema } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'configuration exports and normalized plans are read-only, scoped and omit non-configuration data',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const root = `/v1/projects/${f.a1.id}`;
        expect(
          (await f.request(`${root}/samples`, { key: 'contact', name: 'Contact' }, f.owner.cookie))
            .status,
        ).toBe(201);
        const key = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Reader',
          scopes: ['config:read'],
          expiresAt: null,
        });
        const headers = { authorization: `Bearer ${key.token}` };
        const exported = await f.request(`${root}/config`, undefined, undefined, headers);
        expect(exported.status).toBe(200);
        const document = configDocumentSchema.parse(await exported.json());
        expect(document.modules['samples']?.['contact']).toMatchObject({
          moduleVersion: 1,
          configVersion: 1,
        });
        expect(JSON.stringify(document)).not.toContain(key.token);
        expect(JSON.stringify(document)).not.toContain(f.owner.email);
        const before = await f.snapshot();
        const plan = async (config: unknown) => {
          const response = await f.request(
            `${root}/config?dryRun=true`,
            { config },
            undefined,
            headers,
            'PUT',
          );
          expect(response.status).toBe(200);
          return configPlanResponseSchema.parse(await response.json());
        };
        expect((await plan(document)).changes).toEqual([]);
        expect((await plan({ project: f.a1.id, modules: {} })).changes).toEqual([]);
        const archived = await plan({ ...document, modules: { samples: {} } });
        expect(archived.changes).toMatchObject([
          { kind: 'archive', key: 'contact', destructive: true },
        ]);
        const desired = {
          project: f.a1.id,
          modules: {
            samples: {
              fresh: { name: 'Fresh', moduleVersion: 1, config: {} },
              ...document.modules['samples'],
            },
          },
        };
        const first = await plan(desired);
        const second = await plan({
          ...desired,
          modules: {
            samples: {
              ...document.modules['samples'],
              fresh: {
                config: { options: { enabled: true }, fields: ['email'], title: 'Default title' },
                moduleVersion: 1,
                name: 'Fresh',
              },
            },
          },
        });
        expect(first.planHash).toBe(second.planHash);
        expect(first.changes).toMatchObject([{ kind: 'create', key: 'fresh' }]);
        expect(
          (
            await f.request(
              `${root}/config?dryRun=true`,
              { config: { project: f.a1.id, modules: { disabled: {} } } },
              undefined,
              headers,
              'PUT',
            )
          ).status,
        ).toBe(404);
        expect(await f.snapshot()).toEqual(before);
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog(), keyClock: { now: () => new Date('2026-11-06T11:00:00Z') } },
    );
  },
  30_000,
);
