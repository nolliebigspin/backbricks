import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  AUDIT_RETENTION_DAYS,
  createAuditService,
  createEventService,
  createIds,
  EVENT_RETENTION_DAYS,
  MILLISECONDS_PER_DAY,
  toProblemDetails,
  AppError,
} from '@backbricks/core';
import { sql } from 'drizzle-orm';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
const timestamp = '2026-11-06T00:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const ids = createIds(clock);
const audit = createAuditService({ clock, ids });
const events = createEventService({ clock, ids });

describe.skipIf(!available)('transactional activity services (real Postgres)', () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  beforeAll(async () => {
    fixture = await createTenantFixture();
    await fixture.handle.db.execute(
      sql`alter table audit_logs add constraint fixture_audit_failure check (action <> 'fixture.audit_failure')`,
    );
    await fixture.handle.db.execute(
      sql`alter table events add constraint fixture_event_failure check (type <> 'fixture.event_failure')`,
    );
  });
  afterAll(async () => {
    await fixture.handle.close();
    await fixture.database.drop();
  });
  const context = () => ({ organizationId: 'org-a', projectId: fixture.projectIds.a1 });
  const withTenant = () => createWithTenant(fixture.handle.db);

  test('commits tenant metadata with injected time and bounded expiry', async () => {
    const result = await withTenant()(context(), async (tx) => {
      const auditId = await audit.record(tx, {
        actorType: 'system',
        action: 'project.updated',
        targetType: 'project',
        targetId: fixture.projectIds.a1,
        changes: { changedFields: ['name'] },
      });
      const eventId = await events.publish(tx, {
        type: 'project.updated',
        subjectType: 'project',
        subjectId: fixture.projectIds.a1,
        payload: { changedFields: ['name'] },
      });
      return { auditId, eventId };
    });
    await withTenant()(context(), async ({ repositories }) => {
      const entry = (await repositories.audit.list({ limit: 10 })).find(
        (row) => row.id === result.auditId,
      );
      const event = (await repositories.events.pending(10)).find(
        (row) => row.id === result.eventId,
      );
      expect(entry).toMatchObject({
        organizationId: 'org-a',
        projectId: fixture.projectIds.a1,
        actorId: null,
        changes: { changedFields: ['name'] },
      });
      expect(event?.payload).toEqual({ changedFields: ['name'] });
      expect(entry?.createdAt.toISOString()).toBe(timestamp);
      expect(entry?.expiresAt.getTime()).toBe(
        clock.now().getTime() + AUDIT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
      );
      expect(event?.expiresAt.getTime()).toBe(
        clock.now().getTime() + EVENT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
      );
    });
  });

  test('an actual audit insertion failure rolls back mutation and outbox', async () => {
    const before = await withTenant()(context(), async ({ repositories }) => ({
      project: await repositories.projects.get(fixture.projectIds.a1),
      events: await repositories.events.pending(10),
    }));
    const failure = await withTenant()(context(), async (tx) => {
      await tx.repositories.projects.update(fixture.projectIds.a1, {
        name: 'Must roll back',
        updatedAt: clock.now(),
      });
      await events.publish(tx, { type: 'fixture.created' });
      await audit.record(tx, { actorType: 'system', action: 'fixture.audit_failure' });
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ cause: { code: '23514' } });
    await withTenant()(context(), async ({ repositories }) => {
      expect((await repositories.projects.get(fixture.projectIds.a1)).name).toBe(
        before.project.name,
      );
      expect((await repositories.events.pending(10)).map((row) => row.id)).toEqual(
        before.events.map((row) => row.id),
      );
    });
  });

  test('an actual outbox insertion failure rolls back mutation and audit', async () => {
    const before = await withTenant()(context(), async ({ repositories }) => ({
      project: await repositories.projects.get(fixture.projectIds.a1),
      audit: await repositories.audit.list({ limit: 10 }),
    }));
    const failure = await withTenant()(context(), async (tx) => {
      await tx.repositories.projects.update(fixture.projectIds.a1, {
        name: 'Must roll back',
        updatedAt: clock.now(),
      });
      await audit.record(tx, { actorType: 'system', action: 'fixture.updated' });
      await events.publish(tx, { type: 'fixture.event_failure' });
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ cause: { code: '23514' } });
    await withTenant()(context(), async ({ repositories }) => {
      expect((await repositories.projects.get(fixture.projectIds.a1)).name).toBe(
        before.project.name,
      );
      expect((await repositories.audit.list({ limit: 10 })).map((row) => row.id)).toEqual(
        before.audit.map((row) => row.id),
      );
    });
  });

  test('private fields and secret-shaped metadata fail without being serialized or persisted', async () => {
    const secret = 'bb_sk_do_not_persist';
    const inputs = [
      Object.assign({ actorType: 'system' as const, action: 'fixture.created' }, { token: secret }),
      {
        actorType: 'system' as const,
        action: 'fixture.created',
        changes: { changedFields: [secret] },
      },
    ];
    await Promise.all(
      inputs.map(async (input) => {
        const failure = await withTenant()(context(), (tx) => audit.record(tx, input)).catch(
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(AppError);
        if (!(failure instanceof AppError)) throw new Error('Expected safe service error');
        expect(JSON.stringify(toProblemDetails(failure, 'req_safe'))).not.toContain(secret);
      }),
    );
    const invalidEvent = Object.assign(
      { type: 'fixture.created' },
      { payload: { status: 'received', content: 'private submission content' } },
    );
    const failure = await withTenant()(context(), (tx) => events.publish(tx, invalidEvent)).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'internal_error' });
  });
});
