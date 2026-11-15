import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIds, systemClock } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import { expectDatabaseError } from '../test/expect-database-error.ts';
import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { runMigrations } from './migrate.ts';
import { files } from './schema/files.ts';
import { moduleInstances } from './schema/instances.ts';

const available = await postgresAvailable();
const ids = createIds(systemClock);
const now = new Date('2026-11-15T00:00:00Z');
const expires = new Date('2026-11-16T00:00:00Z');

describe.skipIf(!available)('files schema (real Postgres)', () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  const zones = {
    a: ids.generate('mod'),
    sibling: ids.generate('mod'),
    foreign: ids.generate('mod'),
    form: ids.generate('mod'),
  };
  beforeAll(async () => {
    fixture = await createTenantFixture();
    await runMigrations(fixture.database.url);
    await fixture.handle.db.insert(moduleInstances).values(
      [
        {
          id: zones.a,
          organizationId: 'org-a',
          projectId: fixture.projectIds.a1,
          moduleType: 'uploads',
          key: 'cv',
        },
        {
          id: zones.sibling,
          organizationId: 'org-a',
          projectId: fixture.projectIds.a2,
          moduleType: 'uploads',
          key: 'cv',
        },
        {
          id: zones.foreign,
          organizationId: 'org-b',
          projectId: fixture.projectIds.b1,
          moduleType: 'uploads',
          key: 'cv',
        },
        {
          id: zones.form,
          organizationId: 'org-a',
          projectId: fixture.projectIds.a1,
          moduleType: 'forms',
          key: 'contact',
        },
      ].map((row) =>
        Object.assign(row, {
          name: row.key,
          config: {},
          moduleVersion: 1,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
  });
  afterAll(async () => {
    await fixture.handle.close();
    await fixture.database.drop();
  });

  function record() {
    const id = ids.generate('file');
    const projectId = fixture.projectIds.a1;
    return {
      id,
      organizationId: 'org-a',
      projectId,
      instanceId: zones.a,
      configVersion: 1,
      stagingKey: `stg/org-a/${projectId}/${id}`,
      storageKey: `fil/org-a/${projectId}/${id}`,
      originalName: 'cv.pdf',
      declaredMime: 'application/pdf',
      sizeBytes: 2048,
      uploadTokenHash: Buffer.alloc(32, 1),
      uploadExpiresAt: new Date(now.getTime() + 300_000),
      createdAt: now,
      updatedAt: now,
      expiresAt: expires,
    };
  }
  const insert = (overrides: Record<string, unknown>) =>
    fixture.handle.db.insert(files).values(Object.assign(record(), overrides));

  test('composite parent identity permits only a zone in the same tenant and project', async () => {
    await insert({});
    await Promise.all(
      [zones.sibling, zones.foreign, zones.form].map((instanceId) =>
        expectDatabaseError(insert({ instanceId }), '23503'),
      ),
    );
    await expectDatabaseError(insert({ moduleType: 'forms' }), '23514');
  });

  test('critical byte/token/name/state/expiry constraints fail at storage', async () => {
    const patches = [
      { sizeBytes: 0 },
      { sizeBytes: 104_857_601 },
      { configVersion: 0 },
      { uploadTokenHash: Buffer.alloc(31) },
      { sha256: Buffer.alloc(31) },
      { originalName: 'x'.repeat(256) },
      { ownerType: 'form_submission' },
      { ownerId: 'sub_missing' },
      { subjectEmail: 'Ada@Example.com' },
      { expiresAt: null },
      { expiresAt: now },
      { uploadExpiresAt: now },
      { metadata: [] },
      { scan: [] },
      { scanAttempts: -1 },
      { cleanupAttempts: -1 },
      { deletedAt: now },
    ];
    await Promise.all(patches.map((patch) => expectDatabaseError(insert(patch), '23514')));
    await expectDatabaseError(insert({ status: 'published' }), '22P02');
  });

  test('opaque object keys cannot contain a filename, foreign tenant or arbitrary path', async () => {
    await expectDatabaseError(insert({ stagingKey: 'stg/org-a/cv.pdf' }), '23514');
    await expectDatabaseError(insert({ storageKey: 'fil/org-b/foreign/file.pdf' }), '23514');
    const row = record();
    await fixture.handle.db.insert(files).values(row);
    await expectDatabaseError(fixture.handle.db.insert(files).values(row), '23505');
  });

  test('ready requires final inspection metadata; deletion retains cleanup identity', async () => {
    await expectDatabaseError(insert({ status: 'ready', uploadedAt: now }), '23514');
    await insert({
      status: 'ready',
      uploadedAt: now,
      sha256: Buffer.alloc(32),
      detectedMime: 'application/pdf',
      scan: { status: 'not_scanned' },
    });
    await insert({ deletedAt: now, cleanupAfter: expires });
    await insert({ ownerType: 'form_submission', ownerId: ids.generate('sub'), expiresAt: null });
  });

  test('list/owner/orphan/expiry/deletion scans have tenant-prefixed indexes', async () => {
    const result = await fixture.handle.db.execute(
      sql`select indexname, indexdef from pg_indexes where tablename = 'files'`,
    );
    const definitions = JSON.stringify(result);
    for (const name of [
      'files_list_idx',
      'files_owner_idx',
      'files_orphan_idx',
      'files_expiry_idx',
      'files_cleanup_idx',
      'files_status_idx',
    ])
      expect(definitions).toContain(name);
    expect(definitions).toContain('organization_id, project_id');
  });
});
