import { createHash } from 'node:crypto';

import { apiKeyMetadata, monthlyUsagePeriod, type TenantTransaction } from '@backbricks/core';
import { authSchema, createWithTenant } from '@backbricks/db';

import { createVerifiedUser, idResponseSchema, type AuthFixture } from '../auth-fixture.ts';
import { insertProjectFixture } from '../management-fixture.ts';

const sorted = <T extends { id: string }>(rows: T[]) =>
  rows.toSorted((a, b) => a.id.localeCompare(b.id));

async function instanceSnapshot(repositories: TenantTransaction['repositories']) {
  const result = [];
  for (const instance of await repositories.instances.list({ limit: 100 })) {
    // oxlint-disable-next-line no-await-in-loop -- One tenant transaction owns one physical connection.
    const revisions = await repositories.revisions.list(instance.id, { limit: 100 });
    result.push({ instance, revisions });
  }
  return result;
}

/** Two organizations, two projects each, all roles and separate live invitation targets. */
export async function prepareIsolationFixture(fixture: AuthFixture) {
  const { request, db } = fixture;
  const owner = await createVerifiedUser(fixture);
  const other = await createVerifiedUser(fixture);
  const admin = await createVerifiedUser(fixture);
  const member = await createVerifiedUser(fixture);
  const invited = await createVerifiedUser(fixture);
  const organizationId = idResponseSchema.parse(
    await (
      await request(
        '/organization/create',
        { name: 'Isolation A', slug: 'isolation-a' },
        owner.cookie,
      )
    ).json(),
  ).id;
  const foreignId = idResponseSchema.parse(
    await (
      await request(
        '/organization/create',
        { name: 'Isolation B', slug: 'isolation-b' },
        other.cookie,
      )
    ).json(),
  ).id;
  async function invite(email: string, role: 'admin' | 'member', foreign = false) {
    const response = await request(
      '/organization/invite-member',
      { organizationId: foreign ? foreignId : organizationId, email, role },
      foreign ? other.cookie : owner.cookie,
    );
    if (response.status !== 200) throw new Error(`Invitation setup failed: ${response.status}`);
    return idResponseSchema.parse(await response.json()).id;
  }
  const adminInvite = await invite(admin.email, 'admin');
  const memberInvite = await invite(member.email, 'member');
  await request('/organization/accept-invitation', { invitationId: adminInvite }, admin.cookie);
  await request('/organization/accept-invitation', { invitationId: memberInvite }, member.cookie);
  const acceptId = await invite(invited.email, 'member');
  const cancelId = await invite('cancel-fixture@example.invalid', 'member');
  const foreignInvite = await invite('foreign-fixture@example.invalid', 'member', true);
  const a1 = await insertProjectFixture(db, organizationId, 'A1');
  const a2 = await insertProjectFixture(db, organizationId, 'A2');
  const b1 = await insertProjectFixture(db, foreignId, 'B1');
  const b2 = await insertProjectFixture(db, foreignId, 'B2');
  const memberships = await db.select().from(authSchema.member);
  const memberId = (userId: string) => {
    const record = memberships.find((entry) => entry.userId === userId);
    if (!record) throw new Error('Expected fixture membership');
    return record.id;
  };
  async function snapshot() {
    const organizations = sorted(await db.select().from(authSchema.organization));
    const scoped = await Promise.all(
      organizations.map(({ id }) =>
        createWithTenant(db)({ organizationId: id }, async ({ repositories }) => ({
          projects: await repositories.projects.list({ limit: 100 }),
          audit: (await repositories.audit.list({ limit: 100 })).map((row) => row.id),
          events: (await repositories.events.pending(100)).map((row) => row.id),
        })),
      ),
    );
    const projectState = await Promise.all(
      scoped
        .flatMap((tenant) => tenant.projects)
        .map((project) =>
          createWithTenant(db)(
            { organizationId: project.organizationId, projectId: project.id },
            async ({ repositories }) => ({
              keys: (await repositories.keys.list({ limit: 100 })).map(apiKeyMetadata),
              usage: await repositories.usage.list(monthlyUsagePeriod(fixture.now())),
              instances: await instanceSnapshot(repositories),
            }),
          ),
        ),
    );
    const [members, invitations, sessions, users] = await Promise.all([
      db.select().from(authSchema.member),
      db.select().from(authSchema.invitation),
      db.select().from(authSchema.session),
      db.select().from(authSchema.user),
    ]);
    return {
      submissions: (
        await db.execute<Record<string, unknown>>(
          'select id, organization_id, project_id, instance_id, data, status, read_at, spam_verdict, expires_at, updated_at from form_submissions order by id',
        )
      ).rows,
      scoped,
      projectState,
      organizations: sorted(organizations).map(({ id, name }) => ({ id, name })),
      members: sorted(members),
      invitations: invitations
        .map((row) => ({
          id: createHash('sha256').update(row.id).digest('hex'),
          organizationId: row.organizationId,
          status: row.status,
          role: row.role,
        }))
        .toSorted((a, b) => a.id.localeCompare(b.id)),
      sessions: sorted(sessions).map(({ id, userId, activeOrganizationId }) => ({
        id,
        userId,
        activeOrganizationId,
      })),
      users: sorted(users).map(({ id, emailVerified }) => ({ id, emailVerified })),
    };
  }
  return {
    ...fixture,
    owner,
    other,
    admin,
    member,
    invited,
    organizationId,
    foreignId,
    a1,
    a2,
    b1,
    b2,
    acceptId,
    cancelId,
    foreignInvite,
    memberId,
    snapshot,
  };
}
export type IsolationFixture = Awaited<ReturnType<typeof prepareIsolationFixture>>;
