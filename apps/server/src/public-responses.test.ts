import { expect, test } from 'bun:test';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import {
  assertAllowedFields,
  assertPublicResponseCoverage,
  exercisePublicResponse,
  type PublicResponseCases,
} from '../test/public-responses.ts';

test('the I5 field allowlist rejects any field it does not name', () => {
  expect(() =>
    assertAllowedFields({ id: 'sub_1', items: [{ key: 'a' }] }, ['id', 'items[].key']),
  ).not.toThrow();
  expect(() => assertAllowedFields({ id: 'sub_1', email: 'x@example.com' }, ['id'])).toThrow(
    'outside its allowlist: email',
  );
  expect(() => assertAllowedFields({ items: [{ key: 'a', private: 1 }] }, ['items[].key'])).toThrow(
    'items[].private',
  );
});

test.skipIf(!available)(
  'every public operation has an I5 response case',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const form = await createFormFixture(f);
      const secret = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Public response submitter',
        scopes: ['forms:submit'],
        expiresAt: null,
      });
      const pk = await issueKey(f, f.a1.id, {
        kind: 'publishable',
        name: 'Public response fixture',
        expiresAt: null,
      });
      const operations = base
        .manifest()
        .flatMap((row) =>
          row.policy.kind === 'public' ? [{ method: row.method, path: row.path }] : [],
        );
      const cases: PublicResponseCases = {
        'GET /v1/public/forms/{key}': {
          kind: 'fields',
          request: {
            path: `/v1/public/forms/${form.key}`,
            headers: { authorization: `Bearer ${form.publishable}` },
          },
          fields: [
            'key',
            'proofOfWork',
            'honeypotField',
            'fields[].key',
            'fields[].type',
            'fields[].label',
            'fields[].help',
            'fields[].required',
            'fields[].minLength',
            'fields[].maxLength',
            'fields[].min',
            'fields[].max',
            'fields[].options[].value',
            'fields[].options[].label',
            'fields[].maxFiles',
            'fields[].consent.text',
            'fields[].consent.version',
          ],
        },
        'POST /v1/public/forms/{key}/submissions': {
          kind: 'fields',
          request: {
            path: `/v1/public/forms/${form.key}/submissions`,
            method: 'POST',
            headers: { authorization: `Bearer ${secret.token}` },
            body: { data: validAnswers },
          },
          fields: ['id'],
        },
        'OPTIONS /v1/public/forms/{key}': {
          kind: 'empty',
          status: 204,
          request: {
            path: `/v1/public/forms/${form.key}?key=${form.publishable}`,
            method: 'OPTIONS',
            headers: { origin: 'https://site.test', 'access-control-request-method': 'GET' },
          },
        },
        'OPTIONS /v1/public/forms/{key}/submissions': {
          kind: 'empty',
          status: 204,
          request: {
            path: `/v1/public/forms/${form.key}/submissions?key=${form.publishable}`,
            method: 'OPTIONS',
            headers: { origin: 'https://site.test', 'access-control-request-method': 'POST' },
          },
        },
        'GET /v1/openapi.json': { kind: 'static', request: { path: '/v1/openapi.json' } },
        'GET /v1/schema/config': { kind: 'static', request: { path: '/v1/schema/config' } },
        'GET /v1/auth/capabilities': {
          kind: 'fields',
          request: { path: '/v1/auth/capabilities' },
          fields: ['signupPolicy', 'emailAvailable', 'passwordMinLength'],
        },
        'GET /v1/meta': {
          kind: 'fields',
          request: { path: '/v1/meta' },
          fields: [
            'modules[].type',
            'modules[].displayName.en',
            'modules[].displayName.de',
            'modules[].resourceName.singular',
            'modules[].resourceName.plural',
            'modules[].enabled',
            'modules[].operational',
          ],
        },
        'GET /v1/public/challenge': {
          kind: 'fields',
          request: {
            path: '/v1/public/challenge',
            headers: { authorization: `Bearer ${pk.token}` },
          },
          fields: [
            'parameters.algorithm',
            'parameters.cost',
            'parameters.keyLength',
            'parameters.keyPrefix',
            'parameters.nonce',
            'parameters.salt',
            'parameters.expiresAt',
            'signature',
          ],
        },
        'OPTIONS /v1/public/challenge': {
          kind: 'empty',
          status: 204,
          request: {
            path: `/v1/public/challenge?key=${pk.token}`,
            method: 'OPTIONS',
            headers: { origin: 'https://site.test', 'access-control-request-method': 'GET' },
          },
        },
      };
      assertPublicResponseCoverage(operations, cases);
      expect(() =>
        assertPublicResponseCoverage(
          [...operations, { method: 'GET', path: '/v1/public/unlisted' }],
          cases,
        ),
      ).toThrow('Missing public response case: GET /v1/public/unlisted');
      const tenantValues = [
        f.organizationId,
        f.foreignId,
        f.a1.id,
        f.a2.id,
        f.b1.id,
        f.b2.id,
        f.owner.email,
        f.other.email,
      ];
      for (const operation of operations) {
        const entry = cases[`${operation.method} ${operation.path}`];
        if (!entry) throw new Error('Expected covered public operation');
        // oxlint-disable-next-line no-await-in-loop -- Requests share one fixture and rate-limit identity.
        await exercisePublicResponse(base, entry, { cookie: f.owner.cookie, tenantValues });
      }
    });
  },
  30_000,
);
