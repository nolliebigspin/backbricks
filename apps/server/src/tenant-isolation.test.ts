import { expect, test } from 'bun:test';

import { organizationRouteManifest } from '@backbricks/auth';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { apiIsolationCases } from '../test/isolation/api-cases.ts';
import { authIsolationCases } from '../test/isolation/auth-cases.ts';
import { instanceIsolationCases } from '../test/isolation/instance-cases.ts';
import { keyIsolationCases } from '../test/isolation/key-cases.ts';
import { platformReadIsolationCases } from '../test/isolation/platform-read-cases.ts';
import { projectIsolationCases } from '../test/isolation/project-cases.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { assertIsolationCoverage, exerciseIsolation } from '../test/isolation/suite.ts';
import { managementFixtureRoutes } from '../test/management-fixture.ts';

test.skipIf(!available)(
  'every generated instance operation has a concrete isolation case',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const operations = base
          .manifest()
          .flatMap((row) =>
            row.policy.kind === 'management' &&
            row.policy.isolationCase.startsWith('sample.instance.')
              ? [{ method: row.method, path: row.path, isolationCase: row.policy.isolationCase }]
              : [],
          );
        const cases = await instanceIsolationCases(f);
        expect(operations).toHaveLength(9);
        assertIsolationCoverage(operations, cases);
        for (const operation of operations) {
          const entry = cases[operation.isolationCase];
          if (!entry) throw new Error('Expected covered instance operation');
          // oxlint-disable-next-line no-await-in-loop -- Updates and archive share the preceding instance version.
          await exerciseIsolation(base, entry, () => f.snapshot(), operation);
        }
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog() },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'every registered management operation has a concrete isolation case',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const operations = [
          ...base
            .manifest()
            .flatMap((row) =>
              row.policy.kind === 'management'
                ? [{ method: row.method, path: row.path, isolationCase: row.policy.isolationCase }]
                : [],
            ),
          ...organizationRouteManifest,
        ];
        const cases = {
          ...apiIsolationCases(f),
          ...authIsolationCases(f),
          ...projectIsolationCases(f),
          ...(await keyIsolationCases(f)),
          ...(await platformReadIsolationCases(f)),
        };
        assertIsolationCoverage(operations, cases);
        const missing = Object.fromEntries(
          Object.entries(cases).filter(([id]) => id !== 'fixture.principal'),
        );
        expect(() => assertIsolationCoverage(operations, missing)).toThrow(
          'Missing isolation fixture',
        );
        const principalCase = cases['fixture.principal'];
        if (!principalCase) throw new Error('Expected principal case');
        const mismatch = await exerciseIsolation(base, principalCase, () => f.snapshot(), {
          method: 'GET',
          path: '/v1/different',
          isolationCase: 'fixture.principal',
        }).catch((error: unknown) => error);
        expect(mismatch).toBeInstanceOf(Error);
        expect(String(mismatch)).toContain('Isolation probe does not exercise');
        for (const operation of operations) {
          const entry = cases[operation.isolationCase];
          if (!entry) throw new Error('Expected covered operation');
          // oxlint-disable-next-line no-await-in-loop -- Stateful acceptance/removal cases follow registry order.
          await exerciseIsolation(base, entry, () => f.snapshot(), operation);
        }
        const declared = new Set(
          organizationRouteManifest.map((row) => `${row.method} ${row.path}`),
        );
        const inventory = await base.authInventory();
        expect(inventory.length).toBeGreaterThanOrEqual(organizationRouteManifest.length);
        for (const route of organizationRouteManifest)
          expect(
            inventory.some((row) => row.method === route.method && row.path === route.path),
          ).toBe(true);
        const before = await f.snapshot();
        await Promise.all(
          inventory
            .filter((row) => !declared.has(`${row.method} ${row.path}`))
            .map(async (row) => {
              const response = await base.request(
                row.path.slice('/api/auth'.length),
                row.method === 'GET' ? undefined : {},
                f.owner.cookie,
              );
              expect(response.status).toBe(404);
            }),
        );
        expect(await f.snapshot()).toEqual(before);
      },
      {},
      { configure: managementFixtureRoutes },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'isolation detector catches an unscoped real collection repository',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const entry = apiIsolationCases(f)['fixture.projects'];
        if (!entry) throw new Error('Expected collection case');
        const failure = await exerciseIsolation(base, entry, () => f.snapshot(), {
          method: 'GET',
          path: '/v1/principal-fixture/projects',
          isolationCase: 'fixture.projects',
        }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
      },
      {},
      { configure: (api, db) => managementFixtureRoutes(api, db, { unsafeList: true }) },
    );
  },
  20_000,
);
