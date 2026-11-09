import { expect, test } from 'bun:test';

import { apiKeyCreationResponseSchema, systemClock } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { receivedMail, receivedMailCount } from '../../../scripts/test/mailpit.ts';
import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'exposure commits rejection audit and sends throttled content-free mail only to verified owners/admins',
  async () => {
    let time = systemClock.now().getTime();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const path = `/v1/projects/${f.a1.id}`;
        const key = apiKeyCreationResponseSchema.parse(
          await (
            await f.request(
              `${path}/keys`,
              {
                kind: 'secret',
                name: 'Never email this label',
                scopes: ['project:write', 'integration:read'],
                expiresAt: null,
              },
              f.owner.cookie,
            )
          ).json(),
        );
        const headers = {
          authorization: `Bearer ${key.token}`,
          origin: 'https://foreign.invalid',
          'x-request-id': key.token,
        };
        const attempts = await Promise.all(
          Array.from({ length: 8 }, () =>
            f.request(path, { name: 'Must not change' }, f.owner.cookie, headers, 'PATCH'),
          ),
        );
        expect(attempts.every((response) => response.status === 403)).toBe(true);
        expect(
          attempts.every((response) => response.headers.get('x-request-id') !== key.token),
        ).toBe(true);
        expect(await attempts[0]?.json()).toMatchObject({ code: 'secret_key_exposed' });
        await f.drainSecurity();
        const state = await createWithTenant(f.db)(
          { organizationId: f.organizationId, projectId: f.a1.id },
          async ({ repositories }) => ({
            project: await repositories.projects.get(f.a1.id),
            audit: await repositories.audit.list({ limit: 100 }),
          }),
        );
        expect(state.project.name).toBe('A1');
        const incidents = state.audit.filter((entry) => entry.action === 'key.exposed');
        expect(incidents).toHaveLength(8);
        expect(
          incidents.every(
            (entry) =>
              entry.actorType === 'api_key' &&
              entry.actorId === key.id &&
              entry.ipHash?.byteLength === 32,
          ),
        ).toBe(true);
        expect(incidents.every((entry) => entry.changes?.['reason'] === 'foreign_origin')).toBe(
          true,
        );
        expect(JSON.stringify(incidents)).not.toContain('foreign.invalid');
        expect(JSON.stringify(incidents)).not.toContain(key.token);
        const mail = await receivedMail(f.owner.email, 0, 'Rotate');
        expect(mail.To).toEqual(
          [{ Address: f.owner.email, Name: '' }].map(({ Address }) => ({ Address })),
        );
        expect(mail.Text).not.toContain(key.token);
        expect(mail.Text).not.toContain('Never email this label');
        expect(mail.Text).not.toContain('foreign.invalid');
        expect(await receivedMailCount(f.owner.email, 'Rotate')).toBe(1);
        expect(await receivedMailCount(f.admin.email, 'Rotate')).toBe(1);
        expect(await receivedMailCount(f.member.email, 'Rotate')).toBe(0);
        expect(await receivedMailCount(f.other.email, 'Rotate')).toBe(0);
        const variants = await Promise.all(
          ['null', `${f.origin}/`, 'https://example.invalid'].map((origin) =>
            f.request(path, undefined, undefined, { authorization: `Bearer ${key.token}`, origin }),
          ),
        );
        expect(variants.every((response) => response.status === 403)).toBe(true);
        await f.drainSecurity();
        expect(await receivedMailCount(f.owner.email, 'Rotate')).toBe(1);
        expect(
          (
            await f.request(
              path,
              { name: 'Dashboard allowed' },
              undefined,
              { authorization: `Bearer ${key.token}`, origin: f.origin },
              'PATCH',
            )
          ).status,
        ).toBe(200);
        time += 3_600_000;
        expect((await f.request(path, undefined, undefined, headers)).status).toBe(403);
        await f.drainSecurity();
        expect(await receivedMailCount(f.owner.email, 'Rotate')).toBe(2);
        expect(f.logs.join('')).not.toContain(key.token);
      },
      {},
      { keyClock: { now: () => new Date(time) } },
    );
  },
  25_000,
);

test.skipIf(!available)(
  'failed incident writes roll back throttle claims; missing SMTP retains a bounded notification intent',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const path = `/v1/projects/${f.a1.id}`;
      const key = apiKeyCreationResponseSchema.parse(
        await (
          await f.request(
            `${path}/keys`,
            { kind: 'secret', name: 'No SMTP fixture', scopes: ['project:write'], expiresAt: null },
            f.owner.cookie,
          )
        ).json(),
      );
      await f.capabilities({ mailer: null, signupPolicy: 'invite_only' });
      const headers = { authorization: `Bearer ${key.token}`, origin: 'https://foreign.invalid' };
      for (const table of ['audit_logs', 'events']) {
        const column = table === 'audit_logs' ? 'action' : 'type';
        const denied = table === 'audit_logs' ? 'key.exposed' : 'security.secret_key_exposed';
        // oxlint-disable-next-line no-await-in-loop -- Fixed disposable-database constraints independently force both failures.
        await f.db.execute(
          `alter table ${table} add constraint fixture_incident_failure check (${column} <> '${denied}') not valid`,
        );
        // oxlint-disable-next-line no-await-in-loop -- Each failure compares an independent scoped snapshot.
        const before = await f.snapshot();
        // oxlint-disable-next-line no-await-in-loop -- Authentication must fail before the business action.
        const response = await f.request(
          path,
          { name: 'Must not change' },
          undefined,
          headers,
          'PATCH',
        );
        expect(response.status).toBe(503);
        // oxlint-disable-next-line no-await-in-loop -- Audit/outbox/keys/project all remain unchanged.
        expect(await f.snapshot()).toEqual(before);
        // oxlint-disable-next-line no-await-in-loop -- Remove only the current test constraint.
        await f.db.execute(`alter table ${table} drop constraint fixture_incident_failure`);
      }
      expect(
        (await f.request(path, { name: 'Must not change' }, undefined, headers, 'PATCH')).status,
      ).toBe(403);
      await f.drainSecurity();
      const state = await createWithTenant(f.db)(
        { organizationId: f.organizationId, projectId: f.a1.id },
        async ({ repositories }) => ({
          project: await repositories.projects.get(f.a1.id),
          audit: await repositories.audit.list({ limit: 100 }),
          events: await repositories.events.pending(100),
        }),
      );
      expect(state.project.name).toBe('A1');
      expect(state.audit.filter((entry) => entry.action === 'key.exposed')).toHaveLength(1);
      const notices = state.events.filter((entry) => entry.type === 'security.secret_key_exposed');
      expect(notices).toHaveLength(1);
      expect(notices[0]?.payload).toEqual({ reason: 'foreign_origin' });
      expect(notices[0]?.expiresAt.getTime()).toBeGreaterThan(systemClock.now().getTime());
      expect(JSON.stringify(state)).not.toContain(key.token);
    });
  },
  25_000,
);
