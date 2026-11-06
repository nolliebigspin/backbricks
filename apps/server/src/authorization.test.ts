import { expect, test } from 'bun:test';

import {
  createIds,
  ORGANIZATION_SELECTION_HEADER,
  principalSchema,
  systemClock,
} from '@backbricks/core';
import { authSchema, createWithTenant } from '@backbricks/db';

import { available, scenario, createVerifiedUser, idResponseSchema } from '../test/auth-fixture.ts';
import { insertProjectFixture, managementFixtureRoutes } from '../test/management-fixture.ts';

test.skipIf(!available)(
  'management sessions bind current membership, parent project and immutable principal',
  async () => {
    await scenario(
      async (fixture) => {
        const { request, db } = fixture;
        const owner = await createVerifiedUser(fixture);
        const other = await createVerifiedUser(fixture);
        const member = await createVerifiedUser(fixture);
        const organizationId = idResponseSchema.parse(
          await (
            await request('/organization/create', { name: 'A', slug: 'a' }, owner.cookie)
          ).json(),
        ).id;
        const foreignId = idResponseSchema.parse(
          await (
            await request('/organization/create', { name: 'B', slug: 'b' }, other.cookie)
          ).json(),
        ).id;
        const first = await insertProjectFixture(db, organizationId, 'A1');
        const sibling = await insertProjectFixture(db, organizationId, 'A2');
        const foreign = await insertProjectFixture(db, foreignId, 'B1');
        const path = `/v1/projects/${first.id}/principal-fixture`;
        expect((await request(path)).status).toBe(401);
        expect((await request(path, undefined, owner.cookie)).status).toBe(200);
        expect(
          (await request(`/v1/projects/${foreign.id}/principal-fixture`, undefined, owner.cookie))
            .status,
        ).toBe(404);
        expect(
          (
            await request(path, undefined, owner.cookie, {
              [ORGANIZATION_SELECTION_HEADER]: foreignId,
            })
          ).status,
        ).toBe(404);
        expect(
          (await request(`/v1/organizations/${foreignId}/audit-fixture`, undefined, owner.cookie))
            .status,
        ).toBe(404);
        const list = await (await request('/v1/projects', undefined, owner.cookie)).text();
        expect(list).toContain(first.id);
        expect(list).toContain(sibling.id);
        expect(list).not.toContain(foreign.id);
        expect(
          (
            await request(path, { name: 'Denied CSRF' }, owner.cookie, {
              'x-backbricks-csrf': 'wrong',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await request(path, { name: 'Denied origin' }, owner.cookie, {
              origin: 'https://foreign.invalid',
            })
          ).status,
        ).toBe(403);
        const invitationId = idResponseSchema.parse(
          await (
            await request(
              '/organization/invite-member',
              { organizationId, email: member.email, role: 'member' },
              owner.cookie,
            )
          ).json(),
        ).id;
        await request('/organization/accept-invitation', { invitationId }, member.cookie);
        expect((await request(path, undefined, member.cookie)).status).toBe(200);
        expect((await request(path, { name: 'Denied role' }, member.cookie)).status).toBe(403);
        const stored = await createWithTenant(db)({ organizationId }, ({ repositories }) =>
          repositories.projects.get(first.id),
        );
        expect(stored.name).toBe('A1');
        const membership = (await db.select().from(authSchema.member)).find(
          (entry) => entry.userId === member.id,
        )!;
        await request(
          '/organization/update-member-role',
          { organizationId, memberId: membership.id, role: 'admin' },
          owner.cookie,
        );
        expect((await request(path, { name: 'Admin allowed' }, member.cookie)).status).toBe(200);
        await request(
          '/organization/update-member-role',
          { organizationId, memberId: membership.id, role: 'member' },
          owner.cookie,
        );
        expect((await request(path, { name: 'Old role rejected' }, member.cookie)).status).toBe(
          403,
        );
        const accepted = await request(path, { name: 'Renamed' }, owner.cookie);
        expect(accepted.status).toBe(200);
        const audits = await createWithTenant(db)({ organizationId }, ({ repositories }) =>
          repositories.audit.list({ limit: 100 }),
        );
        expect(audits.find((entry) => entry.action === 'fixture.project_updated')?.actorId).toBe(
          owner.id,
        );
        await request(
          '/organization/remove-member',
          { organizationId, memberIdOrEmail: membership.id },
          owner.cookie,
        );
        expect((await request(path, undefined, member.cookie)).status).toBe(404);
        // A stored active-org claim is only a selector, even when it points at another tenant.
        await db.update(authSchema.session).set({ activeOrganizationId: foreignId });
        expect((await request(path, undefined, owner.cookie)).status).toBe(404);
        const restored = await request(path, undefined, owner.cookie, {
          [ORGANIZATION_SELECTION_HEADER]: organizationId,
        });
        expect(restored.status).toBe(200);
        const snapshot = principalSchema.parse({
          kind: 'secret_key',
          id: createIds(systemClock).generate('key'),
          scopes: ['integration:read'],
        });
        expect(Object.isFrozen(snapshot)).toBe(true);
        if (snapshot.kind !== 'secret_key') throw new Error('Expected key principal');
        expect(Object.isFrozen(snapshot.scopes)).toBe(true);
        const scopes = ['integration:read'];
        const mutablePrincipal = {
          kind: 'secret_key' as const,
          id: createIds(systemClock).generate('key'),
          scopes,
        };
        await createWithTenant(db)(
          { organizationId, projectId: first.id, principal: mutablePrincipal },
          async (tx) => {
            scopes.push('data:read');
            const captured = tx.context.principal;
            if (captured?.kind !== 'secret_key') throw new Error('Expected captured key identity');
            expect(captured.scopes).toEqual(['integration:read']);
            expect(Object.isFrozen(captured.scopes)).toBe(true);
          },
        );
      },
      {},
      { configure: managementFixtureRoutes },
    );
  },
  20_000,
);
