import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import {
  API_KEY_PREFIXES,
  API_KEY_TOKEN_LENGTH,
  ORGANIZATION_SELECTION_HEADER,
  systemClock,
  type SecretKeyIdentity,
  type SecretKeyResolver,
} from '@backbricks/core';
import { createWithTenant, type Database } from '@backbricks/db';

import { available, scenario, createVerifiedUser, idResponseSchema } from '../test/auth-fixture.ts';
import {
  insertKeyFixture,
  insertProjectFixture,
  managementFixtureRoutes,
} from '../test/management-fixture.ts';

test.skipIf(!available)(
  'key resolver contract enforces project/scope boundaries and never falls back to cookies',
  async () => {
    let database: Database | undefined;
    const directory = new Map<string, SecretKeyIdentity>();
    const failingToken = `${API_KEY_PREFIXES.secret}${'Z'.repeat(API_KEY_TOKEN_LENGTH)}`;
    // Fixture-only credential directory. Actual hash discovery/exposure auditing is P1.4c.
    // Reads below still use the real scoped Postgres repository; no database query is mocked.
    const resolveKey: SecretKeyResolver = async (token) => {
      if (token === failingToken) throw new Error(token);
      const reference = directory.get(token);
      if (!reference || !database) return null;
      const key = await createWithTenant(database)(
        {
          organizationId: reference.organizationId,
          projectId: reference.projectId,
        },
        ({ repositories }) => repositories.keys.get(reference.id),
      );
      if (key.revokedAt) return null;
      return { ...reference, scopes: key.scopes };
    };
    await scenario(
      async (fixture) => {
        const { request, db } = fixture;
        database = db;
        const owner = await createVerifiedUser(fixture);
        const other = await createVerifiedUser(fixture);
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
        const readToken = `${API_KEY_PREFIXES.secret}${'A'.repeat(API_KEY_TOKEN_LENGTH)}`;
        const writeToken = `${API_KEY_PREFIXES.secret}${'B'.repeat(API_KEY_TOKEN_LENGTH)}`;
        const readKey = await insertKeyFixture(
          db,
          first,
          createHash('sha256').update(readToken).digest(),
          ['integration:read'],
        );
        const writeKey = await insertKeyFixture(
          db,
          first,
          createHash('sha256').update(writeToken).digest(),
          ['project:write'],
        );
        directory.set(readToken, readKey);
        directory.set(writeToken, writeKey);
        const path = `/v1/projects/${first.id}/principal-fixture`;
        const readHeaders = { authorization: `Bearer ${readToken}` };
        const read = await request(path, undefined, undefined, readHeaders);
        expect(read.status).toBe(200);
        expect(await read.json()).toMatchObject({
          organizationId,
          projectId: first.id,
          principal: { kind: 'secret_key', id: readKey.id },
        });
        expect((await request(path, undefined, other.cookie, readHeaders)).status).toBe(200);
        expect(
          (
            await request(
              `/v1/projects/${sibling.id}/principal-fixture`,
              undefined,
              undefined,
              readHeaders,
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await request(
              `/v1/projects/${foreign.id}/principal-fixture`,
              undefined,
              owner.cookie,
              readHeaders,
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await request(path, undefined, owner.cookie, {
              ...readHeaders,
              [ORGANIZATION_SELECTION_HEADER]: foreignId,
            })
          ).status,
        ).toBe(404);
        expect(
          (await request('/v1/principal-fixture/projects', undefined, owner.cookie, readHeaders))
            .status,
        ).toBe(403);
        expect(
          (await request(path, { name: 'No cookie escalation' }, owner.cookie, readHeaders)).status,
        ).toBe(403);
        expect(
          (
            await request(path, undefined, owner.cookie, {
              authorization: 'Bearer invalid',
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await request(path, undefined, owner.cookie, {
              authorization: 'Basic invalid',
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await request(path, undefined, owner.cookie, {
              authorization: `${API_KEY_PREFIXES.publishable}${'A'.repeat(API_KEY_TOKEN_LENGTH)}`,
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await request(path, undefined, owner.cookie, {
              authorization: `Bearer ${API_KEY_PREFIXES.publishable}${'A'.repeat(API_KEY_TOKEN_LENGTH)}`,
            })
          ).status,
        ).toBe(403);
        const exposed = await request(path, undefined, undefined, {
          ...readHeaders,
          origin: 'https://foreign.invalid',
        });
        expect(exposed.status).toBe(403);
        expect(await exposed.json()).toMatchObject({
          code: 'secret_key_exposed',
        });
        const failure = await request(path, undefined, owner.cookie, {
          authorization: `Bearer ${failingToken}`,
        });
        expect(failure.status).toBe(503);
        expect(await failure.text()).not.toContain(failingToken);
        const renamed = await request(path, { name: 'Scoped key rename' }, undefined, {
          authorization: `Bearer ${writeToken}`,
        });
        expect(renamed.status).toBe(200);
        const audit = await createWithTenant(db)({ organizationId }, ({ repositories }) =>
          repositories.audit.list({ limit: 100 }),
        );
        expect(audit.find((entry) => entry.action === 'fixture.project_updated')).toMatchObject({
          actorType: 'api_key',
          actorId: writeKey.id,
        });
        expect(JSON.stringify(audit)).not.toContain(writeToken);
        expect(fixture.logs.join('')).not.toContain(readToken);
        expect(fixture.logs.join('')).not.toContain(writeToken);
        expect(fixture.logs.join('')).not.toContain(failingToken);
        await createWithTenant(db)({ organizationId, projectId: first.id }, ({ repositories }) =>
          repositories.keys.revoke(readKey.id, systemClock.now()),
        );
        expect((await request(path, undefined, owner.cookie, readHeaders)).status).toBe(401);
      },
      {},
      { configure: managementFixtureRoutes, resolveKey },
    );
  },
  15_000,
);
