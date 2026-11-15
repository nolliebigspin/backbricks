import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIds, systemClock, type TenantContext, type WithTenant } from '@backbricks/core';

import { expectFailure } from '../../test/expect-database-error.ts';
import { createTenantFixture } from '../../test/tenant-fixtures.ts';
import { postgresAvailable } from '../../test/test-database.ts';
import { createDatabase } from '../client.ts';
import { moduleInstances } from '../schema/instances.ts';
import { createWithTenant } from '../with-tenant.ts';
import type { createUploadsRepository } from './files.ts';
import { moduleRepositoryFactories, selectModuleRepositories } from './modules.ts';

type Repo = ReturnType<typeof createUploadsRepository>;
const ids = createIds(systemClock);
const now = new Date('2026-11-15T00:00:00Z');
const later = new Date('2026-11-17T00:00:00Z');
const available = await postgresAvailable();

describe.skipIf(!available)('uploads repository (real Postgres)', () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  let handle: ReturnType<typeof createDatabase>;
  let withTenant: WithTenant;
  let a: TenantContext;
  let sibling: TenantContext;
  let foreign: TenantContext;
  const zones = {
    a: ids.generate('mod'),
    sibling: ids.generate('mod'),
    foreign: ids.generate('mod'),
  };
  beforeAll(async () => {
    fixture = await createTenantFixture();
    handle = createDatabase(fixture.database.url, { max: 4 });
    withTenant = createWithTenant(
      handle.db,
      selectModuleRepositories(moduleRepositoryFactories, ['uploads']),
    );
    a = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    sibling = { organizationId: 'org-a', projectId: fixture.projectIds.a2 };
    foreign = { organizationId: 'org-b', projectId: fixture.projectIds.b1 };
    await handle.db.insert(moduleInstances).values(
      [
        { id: zones.a, ...a, key: 'cv' },
        { id: zones.sibling, ...sibling, key: 'cv' },
        { id: zones.foreign, ...foreign, key: 'cv' },
      ].map((row) =>
        Object.assign(row, {
          projectId: row.projectId ?? '',
          moduleType: 'uploads',
          name: 'CV',
          config: {},
          moduleVersion: 1,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
  });
  afterAll(async () => {
    await handle.close();
    await fixture.handle.close();
    await fixture.database.drop();
  });

  const use = <T>(context: TenantContext, fn: (repo: Repo) => Promise<T>) =>
    withTenant(context, (tx) => {
      const repo = Reflect.get(tx.modules, 'uploads');
      if (!repo) throw new Error('Missing production upload repository.');
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Bound from the production factory above.
      return fn(repo as Repo);
    });
  function draft(context: TenantContext = a, instanceId = zones.a, name = 'CV Ada.pdf') {
    const id = ids.generate('file');
    return {
      id,
      instanceId,
      configVersion: 1,
      stagingKey: `stg/${context.organizationId}/${context.projectId}/${id}`,
      storageKey: `fil/${context.organizationId}/${context.projectId}/${id}`,
      originalName: name,
      declaredMime: 'application/pdf',
      sizeBytes: 4096,
      uploadTokenHash: Buffer.alloc(32, 1),
      uploadExpiresAt: new Date(now.getTime() + 300_000),
      metadata: {},
      isTest: false,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    };
  }

  test('all reads/writes and zone resolution stay project-bound, with lifetime guards', async () => {
    const file = await use(a, (repo) => repo.insert(draft()));
    expect(await use(a, (repo) => repo.resolveZoneKey(file.id, now))).toBe('cv');
    await Promise.all(
      [sibling, foreign].flatMap((context) => [
        expectFailure(
          use(context, (repo) => repo.get(file.id, now)),
          { code: 'not_found' },
        ),
        expectFailure(
          use(context, (repo) =>
            repo.patch(file.id, { updatedAt: now, subjectEmail: 'x@example.com' }),
          ),
          { code: 'not_found' },
        ),
      ]),
    );
    const escaped = await use(a, (repo) => Promise.resolve(repo));
    await expectFailure(escaped.get(file.id, now), {
      message: expect.stringContaining('already ended'),
    });
    await expectFailure(
      use({ organizationId: 'org-a' }, (repo) => repo.get(file.id, now)),
      { message: expect.stringContaining('project') },
    );
  });

  test('lists filter literal names, zone/state/date and page tied timestamps without overlap', async () => {
    const first = await use(a, (repo) => repo.insert(draft(a, zones.a, '100% Ada.pdf')));
    const second = await use(a, (repo) => repo.insert(draft(a, zones.a, '1000 Ada.pdf')));
    expect(
      (await use(a, (repo) => repo.list({ query: '100%' }, { limit: 100 }, now))).map(
        (row) => row.id,
      ),
    ).toEqual([first.id]);
    const page = await use(a, (repo) =>
      repo.list({ query: 'Ada', instanceId: zones.a, status: 'pending' }, { limit: 1 }, now),
    );
    const last = page[0];
    if (!last) throw new Error('Missing first page.');
    const next = await use(a, (repo) =>
      repo.list({ query: 'Ada' }, { limit: 100, before: last }, now),
    );
    expect(next.some((row) => row.id === last.id)).toBe(false);
    expect(
      await use(a, (repo) => repo.list({ query: 'Ada', from: later }, { limit: 100 }, now)),
    ).toEqual([]);
    expect(second.id).not.toBe(first.id);
  });

  test('compare-and-set transitions have one winner and mixed-tenant locks roll back', async () => {
    const file = await use(a, (repo) => repo.insert(draft()));
    const results = await Promise.all(
      [1, 2].map(() =>
        use(a, (repo) =>
          repo.transition(file.id, ['pending'], {
            status: 'uploaded',
            uploadedAt: now,
            updatedAt: now,
          }),
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const other = await use(foreign, (repo) => repo.insert(draft(foreign, zones.foreign)));
    await expectFailure(
      use(a, async (repo) => {
        await repo.lockMany([file.id, other.id], now);
        await repo.patch(file.id, { subjectEmail: 'must-rollback@example.com', updatedAt: now });
      }),
      { code: 'not_found' },
    );
    expect((await use(a, (repo) => repo.get(file.id, now))).subjectEmail).toBeNull();
  });

  test('expired/deleted records are hidden but remain available to bounded cleanup', async () => {
    const file = await use(a, (repo) => repo.insert(draft()));
    await expectFailure(
      use(a, (repo) => repo.get(file.id, later)),
      { code: 'not_found' },
    );
    await use(a, (repo) =>
      repo.patch(file.id, { deletedAt: now, cleanupAfter: later, updatedAt: now }),
    );
    await expectFailure(
      use(a, (repo) => repo.get(file.id, now)),
      { code: 'not_found' },
    );
    expect((await use(a, (repo) => repo.get(file.id, now, { includeInactive: true }))).id).toBe(
      file.id,
    );
    expect(await use(a, (repo) => repo.removeDeleted(file.id, now))).toBe(false);
    expect(
      (await use(a, (repo) => repo.findCleanup(later, 100))).some((row) => row.id === file.id),
    ).toBe(true);
    await use(a, (repo) => repo.patch(file.id, { stagingCleanedAt: later, updatedAt: later }));
    expect(await use(a, (repo) => repo.removeDeleted(file.id, later))).toBe(false);
    await use(a, (repo) => repo.patch(file.id, { storageCleanedAt: later, updatedAt: later }));
    expect(await use(a, (repo) => repo.removeDeleted(file.id, later))).toBe(true);
  });

  test('usage uses bigint aggregates and owner/subject queries never cross projects', async () => {
    const owner = { type: 'form_submission', id: ids.generate('sub') };
    const file = await use(a, (repo) => repo.insert(draft()));
    await use(a, (repo) =>
      repo.patch(file.id, {
        ownerType: owner.type,
        ownerId: owner.id,
        subjectEmail: 'ada@example.com',
        updatedAt: now,
      }),
    );
    expect((await use(a, (repo) => repo.byOwner(owner, now))).map((row) => row.id)).toEqual([
      file.id,
    ]);
    expect(await use(sibling, (repo) => repo.byOwner(owner, now))).toEqual([]);
    expect(
      (await use(a, (repo) => repo.findBySubject('ada@example.com', { limit: 100 }))).map(
        (row) => row.id,
      ),
    ).toEqual([file.id]);
    const usage = await use(a, (repo) => repo.usage());
    expect(typeof usage.reservedBytes).toBe('bigint');
    expect(usage.reservedBytes).toBeGreaterThanOrEqual(4096n);
  });

  test('retention recomputation preserves orphan expiry and selection omits disabled repositories', async () => {
    const owned = await use(a, (repo) => repo.insert(draft()));
    const orphan = await use(a, (repo) => repo.insert(draft()));
    await use(a, (repo) =>
      repo.patch(owned.id, {
        ownerType: 'form_submission',
        ownerId: ids.generate('sub'),
        updatedAt: now,
      }),
    );
    await use(a, (repo) => repo.recomputeExpiry(zones.a, 7));
    expect((await use(a, (repo) => repo.get(owned.id, now))).expiresAt).toEqual(
      new Date('2026-11-22T00:00:00Z'),
    );
    expect((await use(a, (repo) => repo.get(orphan.id, now))).expiresAt).toEqual(
      new Date('2026-11-16T00:00:00Z'),
    );
    const selected = createWithTenant(
      handle.db,
      selectModuleRepositories(moduleRepositoryFactories, ['forms']),
    );
    expect(
      await selected(a, (tx) => Promise.resolve(Reflect.get(tx.modules, 'uploads'))),
    ).toBeUndefined();
  });
});
