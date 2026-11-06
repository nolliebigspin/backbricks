import { expect, test } from 'bun:test';

import { organizationRouteManifest } from '@backbricks/auth';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'every mounted management method rejects malformed, publishable and revoked bearer credentials',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const published = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Public fixture',
          expiresAt: null,
        });
        const revoked = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Revoked fixture',
          preset: 'agent',
          expiresAt: null,
        });
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}/keys/${revoked.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        const operations = [
          ...f
            .manifest()
            .filter((row) => row.policy.kind === 'management')
            .map((row) => ({
              method: row.method,
              path: row.path,
            })),
          ...organizationRouteManifest,
        ];
        expect(operations.length).toBeGreaterThan(organizationRouteManifest.length);
        const before = await f.snapshot();
        for (const operation of operations) {
          const path = operation.path
            .replaceAll('{organizationId}', f.organizationId)
            .replaceAll('{projectId}', f.a1.id)
            .replace(/\{[^}]+\}/g, 'unavailable');
          const requestPath = path.startsWith('/v1/') ? path : path.slice('/api/auth'.length);
          for (const credential of [
            { token: 'malformed', status: 401 },
            { token: published.token, status: path.startsWith('/v1/') ? 403 : 401 },
            { token: revoked.token, status: 401 },
          ]) {
            const body = ['GET', 'HEAD', 'DELETE'].includes(operation.method) ? undefined : {};
            const headers = { authorization: `Bearer ${credential.token}` };
            // oxlint-disable-next-line no-await-in-loop -- Attribute credential failures to the exact mounted method.
            const denied = await f.request(requestPath, body, undefined, headers, operation.method);
            expect(denied.status, `${operation.method} ${operation.path}`).toBe(credential.status);
            if (path.startsWith('/v1/')) {
              // oxlint-disable-next-line no-await-in-loop -- Bearer selection must never fall back to a valid cookie.
              const withCookie = await f.request(
                requestPath,
                body,
                f.owner.cookie,
                headers,
                operation.method,
              );
              expect(withCookie.status, `${operation.method} ${operation.path} with cookie`).toBe(
                credential.status,
              );
            }
          }
        }
        expect(await f.snapshot()).toEqual(before);
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog() },
    );
  },
  30_000,
);
