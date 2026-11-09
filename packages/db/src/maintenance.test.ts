/* oxlint-disable no-await-in-loop -- Seed bounded fixtures with ordered database writes. */
import { expect, test } from 'bun:test';

import { createIds, MAIL_JOB_NAME, systemClock } from '@backbricks/core';
import { eq } from 'drizzle-orm';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createDatabase, databasePool } from './client.ts';
import { createPostgresQueue } from './queue.ts';
import { createMaintenanceRepository } from './repositories/maintenance.ts';
import {
  account,
  invitation,
  member,
  session,
  user,
  verification,
} from './schema/auth.generated.ts';
import { auditLogs, events } from './schema/platform.ts';
import { authTokenReplays, powChallengesUsed, rateLimitBuckets } from './schema/technical.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
test.skipIf(!available)(
  'bounded maintenance purges only expired technical/auth rows with concurrent claims and preserves active identities',
  async () => {
    const f = await createTenantFixture();
    const second = createDatabase(f.database.url);
    const maintenance = createMaintenanceRepository(f.handle.db);
    const other = createMaintenanceRepository(second.db);
    const now = systemClock.now();
    const past = new Date(now.getTime() - 86_400_000);
    const future = new Date(now.getTime() + 86_400_000);
    try {
      await f.handle.db.insert(user).values({
        id: 'maintenance-user',
        name: 'Fixture',
        email: 'maintenance@example.invalid',
        emailVerified: true,
        createdAt: past,
        updatedAt: past,
      });
      await f.handle.db.insert(member).values({
        id: 'maintenance-member',
        userId: 'maintenance-user',
        organizationId: 'org-a',
        role: 'owner',
        createdAt: past,
      });
      await f.handle.db.insert(account).values({
        id: 'maintenance-account',
        userId: 'maintenance-user',
        accountId: 'maintenance-user',
        providerId: 'credential',
        password: 'fixture-hash',
        createdAt: past,
        updatedAt: past,
      });
      await f.handle.db.insert(session).values([
        {
          id: 'expired-session',
          token: 'expired-fixture-session',
          userId: 'maintenance-user',
          createdAt: past,
          updatedAt: past,
          expiresAt: now,
        },
        {
          id: 'active-session',
          token: 'active-fixture-session',
          userId: 'maintenance-user',
          createdAt: past,
          updatedAt: past,
          expiresAt: future,
        },
      ]);
      await f.handle.db.insert(verification).values([
        {
          id: 'expired-verification',
          identifier: 'expired',
          value: 'fixture',
          createdAt: past,
          updatedAt: past,
          expiresAt: now,
        },
        {
          id: 'active-verification',
          identifier: 'active',
          value: 'fixture',
          createdAt: past,
          updatedAt: past,
          expiresAt: future,
        },
      ]);
      await f.handle.db.insert(invitation).values([
        {
          id: 'expired-invitation',
          email: 'expired@example.invalid',
          role: 'member',
          organizationId: 'org-a',
          inviterId: 'maintenance-user',
          createdAt: past,
          expiresAt: now,
        },
        {
          id: 'active-invitation',
          email: 'active@example.invalid',
          role: 'member',
          organizationId: 'org-a',
          inviterId: 'maintenance-user',
          createdAt: past,
          expiresAt: future,
        },
      ]);
      for (let index = 0; index < 8; index++) {
        const expiresAt = index === 7 ? future : now;
        await f.handle.db
          .insert(rateLimitBuckets)
          .values({ bucket: `fixture-${index}`, count: 1, windowStart: past, expiresAt });
        await f.handle.db
          .insert(powChallengesUsed)
          .values({ signature: index.toString(16).padStart(64, '0'), expiresAt });
        await f.handle.db
          .insert(authTokenReplays)
          .values({ digest: index.toString(16).padStart(64, '0'), expiresAt });
      }
      const parallel = await Promise.all([
        maintenance.purgeGlobal(now, 3),
        other.purgeGlobal(now, 3),
      ]);
      expect(parallel.every((counts) => Object.values(counts).every((count) => count <= 3))).toBe(
        true,
      );
      expect(parallel.reduce((sum, counts) => sum + counts.proofs, 0)).toBe(6);
      expect((await maintenance.purgeGlobal(now, 3)).proofs).toBe(1);
      expect(
        Object.values(await maintenance.purgeGlobal(now, 3)).every((count) => count === 0),
      ).toBe(true);
      expect(await f.handle.db.select({ id: session.id }).from(session)).toEqual([
        { id: 'active-session' },
      ]);
      expect(await f.handle.db.select({ id: verification.id }).from(verification)).toEqual([
        { id: 'active-verification' },
      ]);
      expect(await f.handle.db.select({ id: invitation.id }).from(invitation)).toEqual([
        { id: 'active-invitation' },
      ]);
      expect(await f.handle.db.select().from(user)).toHaveLength(1);
      expect(await f.handle.db.select().from(member)).toHaveLength(1);
      expect(await f.handle.db.select().from(account)).toHaveLength(1);
      expect(await f.handle.db.select().from(rateLimitBuckets)).toHaveLength(1);
      expect(await f.handle.db.select().from(powChallengesUsed)).toHaveLength(1);
      expect(await f.handle.db.select().from(authTokenReplays)).toHaveLength(1);
    } finally {
      await second.close();
      await f.handle.close();
      await f.database.drop();
    }
  },
  15_000,
);

test.skipIf(!available)(
  'tenant cleanup includes archived projects, isolates organizations, rolls back failed purges and never leaks the audit override',
  async () => {
    const f = await createTenantFixture();
    const maintenance = createMaintenanceRepository(f.handle.db);
    const withTenant = createWithTenant(f.handle.db);
    const now = systemClock.now();
    const past = new Date(now.getTime() - 86_400_000);
    const future = new Date(now.getTime() + 86_400_000);
    const ids = createIds({ now: () => past });
    const pool = databasePool(f.handle.db);
    try {
      for (const [organizationId, projectId] of [
        ['org-a', f.projectIds.a1],
        ['org-b', f.projectIds.b1],
      ]) {
        if (!organizationId || !projectId) throw new Error('Missing tenant fixture');
        await withTenant({ organizationId, projectId }, async (tx) => {
          for (const expiresAt of [now, future]) {
            await tx.repositories.audit.insert({
              id: ids.generate('aud'),
              actorType: 'system',
              actorId: null,
              action: 'fixture.expiry',
              targetType: null,
              targetId: null,
              changes: null,
              ipHash: null,
              requestId: null,
              createdAt: past,
              expiresAt,
            });
            await tx.repositories.events.insert({
              id: ids.generate('evt'),
              type: 'fixture.expiry',
              subjectType: null,
              subjectId: null,
              payload: {},
              createdAt: past,
              expiresAt,
              dispatchedAt: null,
            });
            await tx.repositories.idempotency.insert({
              key: expiresAt === now ? 'expired' : 'active',
              requestHash: new Uint8Array(32),
              responseStatus: 200,
              responseBody: { accepted: true },
              createdAt: past,
              expiresAt,
            });
          }
        });
      }
      await withTenant({ organizationId: 'org-a' }, (tx) =>
        tx.repositories.projects.update(f.projectIds.a1, { deletedAt: now }),
      );
      await pool.query(
        "create function fixture_purge_failure() returns trigger language plpgsql as $$ begin raise exception 'Purge fixture failure'; end $$",
      );
      await pool.query(
        'create trigger fixture_purge_failure before delete on events for each row execute function fixture_purge_failure()',
      );
      expect(
        await withTenant({ organizationId: 'org-a' }, (tx) =>
          maintenance.purgeTenant(tx, now),
        ).catch((error: unknown) => error),
      ).toBeInstanceOf(Error);
      expect(
        await f.handle.db.select().from(auditLogs).where(eq(auditLogs.organizationId, 'org-a')),
      ).toHaveLength(2);
      expect(
        (await pool.query("select current_setting('app.allow_audit_purge', true) as flag"))
          .rows[0]?.['flag'],
      ).not.toBe('on');
      await pool.query('drop trigger fixture_purge_failure on events');
      expect(
        await withTenant({ organizationId: 'org-a' }, (tx) => maintenance.purgeTenant(tx, now)),
      ).toEqual({ audit: 1, events: 1, idempotency: 1 });
      expect(
        await withTenant({ organizationId: 'org-a' }, (tx) => maintenance.purgeTenant(tx, now)),
      ).toEqual({ audit: 0, events: 0, idempotency: 0 });
      expect(
        await f.handle.db.select().from(auditLogs).where(eq(auditLogs.organizationId, 'org-b')),
      ).toHaveLength(2);
      expect(
        await f.handle.db.select().from(events).where(eq(events.organizationId, 'org-b')),
      ).toHaveLength(2);
      expect(
        await withTenant(
          {
            organizationId: 'org-a',
            principal: { kind: 'session', id: 'maintenance-user', role: 'owner' },
          },
          (tx) => maintenance.purgeTenant(tx, now),
        ).catch((error: unknown) => error),
      ).toMatchObject({ code: 'forbidden' });
      const active = (
        await f.handle.db.select().from(auditLogs).where(eq(auditLogs.organizationId, 'org-a'))
      )[0];
      if (!active) throw new Error('Expected current audit');
      expect(
        await f.handle.db
          .delete(auditLogs)
          .where(eq(auditLogs.id, active.id))
          .catch((error: unknown) => error),
      ).toMatchObject({ cause: { code: '23000' } });
    } finally {
      await f.handle.close();
      await f.database.drop();
    }
  },
  15_000,
);

test.skipIf(!available)(
  'absolute job expiry hard-deletes failed token-bearing mail while preserving current delivery intent',
  async () => {
    const f = await createTenantFixture();
    const now = systemClock.now();
    const queue = createPostgresQueue(f.handle.db, []);
    const pool = databasePool(f.handle.db);
    const message = {
      to: 'fixture@example.invalid',
      subject: 'Fixture',
      text: 'test-only-bearer-link',
      html: '<p>test-only-bearer-link</p>',
    };
    try {
      await queue.start();
      await f.handle.db.transaction((tx) => queue.enqueueMail(tx, [message, message]));
      const jobs = (await pool.query<{ id: string }>('select id from pgboss.job order by id')).rows;
      const expired = jobs[0]?.id;
      if (!expired) throw new Error('Expected delivery');
      await pool.query(
        "update pgboss.job set state = 'failed', keep_until = $1, completed_on = $1 where id = $2",
        [new Date(now.getTime() - 1), expired],
      );
      expect(await queue.purgeExpiredJobs(now, 1)).toBe(1);
      expect(await queue.purgeExpiredJobs(now, 1)).toBe(0);
      expect((await pool.query<{ name: string }>('select name from pgboss.job')).rows).toEqual([
        { name: MAIL_JOB_NAME },
      ]);
    } finally {
      await queue.stop();
      await f.handle.close();
      await f.database.drop();
    }
  },
  15_000,
);
