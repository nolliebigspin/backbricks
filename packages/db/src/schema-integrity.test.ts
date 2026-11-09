import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIds, systemClock } from '@backbricks/core';
import { eq, sql } from 'drizzle-orm';

import { expectDatabaseError } from '../test/expect-database-error.ts';
import { createTestDatabase, postgresAvailable } from '../test/test-database.ts';
import { createDatabase, type DatabaseHandle } from './client.ts';
import { runMigrations } from './migrate.ts';
import { organization } from './schema/auth.generated.ts';
import { moduleInstanceRevisions, moduleInstances } from './schema/instances.ts';
import { auditLogs, notificationRules } from './schema/platform.ts';
import { apiKeys, projects } from './schema/projects.ts';
import { idempotencyKeys } from './schema/technical.ts';

const available = await postgresAvailable();
const ids = createIds(systemClock);
const now = systemClock.now();
const past = new Date('2020-01-01T00:00:00Z');
const future = new Date('9999-01-01T00:00:00Z');
const projectA = ids.generate('prj');
const projectA2 = ids.generate('prj');
const projectB = ids.generate('prj');
const instanceA = ids.generate('mod');

describe.skipIf(!available)('platform schema integrity (real Postgres)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let handle: DatabaseHandle;
  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.url);
    handle = createDatabase(database.url, { max: 1 });
    await handle.db.insert(organization).values([
      { id: 'org-a', name: 'A', slug: 'a', createdAt: now },
      { id: 'org-b', name: 'B', slug: 'b', createdAt: now },
    ]);
    await handle.db.insert(projects).values([
      {
        id: projectA,
        organizationId: 'org-a',
        name: 'A',
        slug: 'a',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: projectA2,
        organizationId: 'org-a',
        name: 'A2',
        slug: 'a2',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: projectB,
        organizationId: 'org-b',
        name: 'B',
        slug: 'b',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await handle.db.insert(moduleInstances).values({
      id: instanceA,
      organizationId: 'org-a',
      projectId: projectA,
      moduleType: 'fixture',
      key: 'example',
      name: 'Example',
      config: {},
      moduleVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
  afterAll(async () => {
    await handle.close();
    await database.drop();
  });

  test('valid foreign project IDs cannot be combined with another organization', async () => {
    await expectDatabaseError(
      Promise.resolve(
        handle.db.insert(moduleInstances).values({
          id: ids.generate('mod'),
          organizationId: 'org-a',
          projectId: projectB,
          moduleType: 'fixture',
          key: 'foreign',
          name: 'Foreign',
          config: {},
          moduleVersion: 1,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      '23503',
    );
    await expectDatabaseError(
      Promise.resolve(
        handle.db.insert(idempotencyKeys).values({
          organizationId: 'org-a',
          projectId: projectB,
          key: 'foreign',
          requestHash: Buffer.alloc(32),
          responseStatus: 200,
          responseBody: { id: 'public-result' },
          createdAt: now,
          expiresAt: future,
        }),
      ),
      '23503',
    );
  });

  test('revisions and notification rules cannot reference a sibling project instance', async () => {
    await expectDatabaseError(
      Promise.resolve(
        handle.db.insert(moduleInstanceRevisions).values({
          id: ids.generate('rvn'),
          organizationId: 'org-a',
          projectId: projectA2,
          instanceId: instanceA,
          configVersion: 1,
          moduleVersion: 1,
          config: {},
          actorType: 'system',
          createdAt: now,
        }),
      ),
      '23503',
    );
    await expectDatabaseError(
      Promise.resolve(
        handle.db.insert(notificationRules).values({
          id: ids.generate('ntf'),
          organizationId: 'org-a',
          projectId: projectA2,
          instanceId: instanceA,
          eventType: 'fixture.created',
          recipientUserIds: ['fixture-user-id'],
          createdAt: now,
          updatedAt: now,
        }),
      ),
      '23503',
    );
  });

  test('secret keys cannot store a public token or a non-SHA-256 lookup value', async () => {
    const base = {
      organizationId: 'org-a',
      projectId: projectA,
      kind: 'secret' as const,
      name: 'Key',
      displayPrefix: 'bb_sk_example',
      createdAt: now,
    };
    await expectDatabaseError(
      Promise.resolve(
        handle.db.insert(apiKeys).values({
          ...base,
          id: ids.generate('key'),
          lookupHash: Buffer.alloc(32),
          publicToken: 'bb_sk_do_not_store',
        }),
      ),
      '23514',
    );
    await expectDatabaseError(
      Promise.resolve(
        handle.db.insert(apiKeys).values({
          ...base,
          id: ids.generate('key'),
          lookupHash: Buffer.alloc(8),
        }),
      ),
      '23514',
    );
  });

  test('audit rows remain immutable, including when the purge flag is set', async () => {
    const id = ids.generate('aud');
    await handle.db.insert(auditLogs).values({
      id,
      organizationId: 'org-a',
      actorType: 'system',
      action: 'fixture.created',
      createdAt: now,
      expiresAt: future,
    });
    await expectDatabaseError(
      Promise.resolve(
        handle.db.update(auditLogs).set({ action: 'tampered' }).where(eq(auditLogs.id, id)),
      ),
      '23000',
    );
    await expectDatabaseError(
      Promise.resolve(handle.db.delete(auditLogs).where(eq(auditLogs.id, id))),
      '23000',
    );
    await expectDatabaseError(
      Promise.resolve(
        handle.db.transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.allow_audit_purge', 'on', true)`);
          await tx.delete(auditLogs).where(eq(auditLogs.id, id));
        }),
      ),
      '23000',
    );
    await expectDatabaseError(
      Promise.resolve(
        handle.db.transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.allow_audit_purge', 'on', true)`);
          await tx.update(auditLogs).set({ action: 'tampered' }).where(eq(auditLogs.id, id));
        }),
      ),
      '23000',
    );
  });

  test('expired audit can be purged without its local flag leaking to other transactions', async () => {
    const id = ids.generate('aud');
    await handle.db.insert(auditLogs).values({
      id,
      organizationId: 'org-a',
      actorType: 'system',
      action: 'fixture.expired',
      createdAt: new Date('2019-01-01T00:00:00Z'),
      expiresAt: past,
    });
    await expectDatabaseError(
      Promise.resolve(handle.db.delete(auditLogs).where(eq(auditLogs.id, id))),
      '23000',
    );
    await handle.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.allow_audit_purge', 'on', true)`);
      await tx.delete(auditLogs).where(eq(auditLogs.id, id));
    });
    expect(await handle.db.select().from(auditLogs).where(eq(auditLogs.id, id))).toEqual([]);
    const setting = await handle.db.execute<{ flag: string }>(
      sql`select current_setting('app.allow_audit_purge', true) as flag`,
    );
    expect(setting.rows[0]?.flag).toBe('');
  });

  test('historical audit survives live organization/project erasure', async () => {
    const projectId = ids.generate('prj');
    const auditId = ids.generate('aud');
    await handle.db
      .insert(organization)
      .values({ id: 'org-removed', name: 'Removed', slug: 'removed', createdAt: now });
    await handle.db.insert(projects).values({
      id: projectId,
      organizationId: 'org-removed',
      name: 'Removed',
      slug: 'removed',
      createdAt: now,
      updatedAt: now,
    });
    await handle.db.insert(auditLogs).values({
      id: auditId,
      organizationId: 'org-removed',
      projectId,
      actorType: 'system',
      action: 'fixture.erased',
      createdAt: now,
      expiresAt: future,
    });
    await handle.db.delete(organization).where(eq(organization.id, 'org-removed'));
    expect(await handle.db.select().from(projects).where(eq(projects.id, projectId))).toEqual([]);
    expect(
      await handle.db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.id, auditId)),
    ).toEqual([{ id: auditId }]);
  });

  test('hand-written SQL objects the Drizzle schema does not declare still exist', async () => {
    // Owned by migrations 20261106024528_audit_immutability and 20261106124449_maintenance_expiry.
    // A later generated migration that drops or changes one of them fails here.
    const indexes = await handle.db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes where schemaname = current_schema()
          and indexname in ('member_organization_user_unique', 'session_expiry_idx',
            'verification_expiry_idx', 'invitation_expiry_idx')`,
    );
    expect(
      Object.fromEntries(
        indexes.rows.map((row) => [row.indexname, row.indexdef.replace(/^.* USING /, '')]),
      ),
    ).toEqual({
      member_organization_user_unique: 'btree (organization_id, user_id)',
      session_expiry_idx: 'btree (expires_at)',
      verification_expiry_idx: 'btree (expires_at)',
      invitation_expiry_idx: 'btree (expires_at)',
    });
    expect(
      indexes.rows.find((row) => row.indexname === 'member_organization_user_unique')?.indexdef,
    ).toStartWith('CREATE UNIQUE INDEX');
    const triggers = await handle.db.execute<{
      tgname: string;
      tgenabled: string;
      proname: string;
    }>(
      sql`select t.tgname, t.tgenabled, p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = 'audit_logs'::regclass and not t.tgisinternal`,
    );
    expect(triggers.rows).toEqual([
      { tgname: 'audit_logs_no_update', tgenabled: 'O', proname: 'audit_logs_immutable' },
    ]);
  });

  test('ephemeral rate buckets use UNLOGGED storage', async () => {
    const result = await handle.db.execute<{ relpersistence: string }>(
      sql`select relpersistence from pg_class where oid = 'rate_limit_buckets'::regclass`,
    );
    expect(result.rows[0]?.relpersistence).toBe('u');
  });
});
