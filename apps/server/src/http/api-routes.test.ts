import { describe, expect, test } from 'bun:test';

import { createIds, systemClock } from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import { createApp } from '../app.ts';
import { createLogger } from '../logger.ts';
import type { ApiAuthorization, ApiRoutes } from './api-routes.ts';

const example = createRoute({
  method: 'post',
  path: '/v1/examples/{id}',
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ name: z.string().min(1) }).strict() } },
    },
  },
  responses: {
    200: {
      description: 'An explicitly public result.',
      content: { 'application/json': { schema: z.object({ id: z.string() }) } },
    },
  },
});

function setup(configure: (api: ApiRoutes) => void = () => {}, authorize?: ApiAuthorization) {
  return createApp(
    {
      log: createLogger('silent'),
      ids: createIds(systemClock),
      readinessChecks: [],
      dashboardDir: null,
    },
    configure,
    authorize,
  );
}

function publicExample(limit = 128) {
  return setup((api) =>
    api.register(example, { kind: 'public', bodyLimitBytes: limit }, (c) => {
      return c.json({ id: c.req.valid('param').id }, 200);
    }),
  );
}

describe('declared API routes', () => {
  test('serves the generated contract without runtime infrastructure or internal metadata', async () => {
    const app = publicExample();
    const response = await app.request('/v1/openapi.json');
    expect(response.status).toBe(200);
    const document = await response.text();
    expect(document).toContain('"openapi":"3.1.0"');
    expect(document).toContain('/v1/examples/{id}');
    expect(document).not.toContain('isolationCase');
    expect(document).not.toContain('databaseUrl');
    expect(document).not.toContain('/api/auth');
    expect(app.apiRoutes.manifest).toHaveLength(2);
  });

  test('validates requests and returns only the declared public result', async () => {
    const response = await publicExample().request('/v1/examples/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'example' });
  });

  test('validation failures use problem details without echoing input values', async () => {
    const response = await publicExample().request('/v1/examples/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123, secret: 'bb_sk_do_not_echo' }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await response.text();
    expect(body).toContain('validation_failed');
    expect(body).not.toContain('bb_sk_do_not_echo');
  });

  test('malformed JSON and unsupported content types are structured client errors', async () => {
    const app = publicExample();
    await Promise.all(
      (
        [
          ['application/json', '{', 400],
          ['text/plain', 'private input', 415],
        ] as const
      ).map(async ([contentType, body, status]) => {
        const response = await app.request('/v1/examples/example', {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body,
        });
        expect(response.status).toBe(status);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        expect(await response.text()).not.toContain('private input');
      }),
    );
  });

  test('enforces the smaller route body limit on streamed bodies', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ name: 'x'.repeat(256) })));
        controller.close();
      },
    });
    const response = await publicExample().request('/v1/examples/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'payload_too_large' });
  });

  test('management routes fail closed until the authorization integration is wired', async () => {
    const app = setup((api) =>
      api.register(
        example,
        {
          kind: 'management',
          bodyLimitBytes: 128,
          session: { role: 'member' },
          isolationCase: 'example',
        },
        (c) => c.json({ id: c.req.valid('param').id }, 200),
      ),
    );
    const response = await app.request('/v1/examples/example', { method: 'POST' });
    expect(response.status).toBe(503);
  });

  test('authorization precedes input validation and receives the declared policy', async () => {
    let authorized = false;
    const app = setup(
      (api) =>
        api.register(
          createRoute({ ...example, path: '/v1/projects/{id}/examples' }),
          {
            kind: 'management',
            bodyLimitBytes: 128,
            secretKey: { scope: 'config:read' },
            isolationCase: 'example',
          },
          (c) => c.json({ id: c.req.valid('param').id }, 200),
        ),
      (policy, _context, tenant) => {
        expect(policy.secretKey?.scope).toBe('config:read');
        expect(tenant.projectParam).toBe('id');
        authorized = true;
      },
    );
    const response = await app.request('/v1/projects/example/examples', { method: 'POST' });
    expect(authorized).toBe(true);
    expect(response.status).toBe(422);
  });

  test('secret-key operations cannot be registered without a project path', () => {
    expect(() =>
      setup((api) =>
        api.register(
          example,
          {
            kind: 'management',
            bodyLimitBytes: 128,
            secretKey: { scope: 'config:read' },
            isolationCase: 'unbound',
          },
          (c) => c.json({ id: c.req.valid('param').id }, 200),
        ),
      ),
    ).toThrow('must be project-scoped');
  });

  test('implicit HEAD requests cannot bypass GET authorization', async () => {
    const app = setup((api) =>
      api.register(
        createRoute({
          method: 'get',
          path: '/v1/protected',
          responses: {
            200: {
              description: 'Protected.',
              content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
            },
          },
        }),
        {
          kind: 'management',
          bodyLimitBytes: 128,
          session: { role: 'owner' },
          isolationCase: 'protected',
        },
        (c) => c.json({ ok: true }, 200),
      ),
    );
    expect((await app.request('/v1/protected', { method: 'HEAD' })).status).toBe(503);
  });

  test('raw registrations and duplicate-path handlers cannot hide behind a declared operation', () => {
    const app = publicExample();
    app.get('/v1/undeclared', (c) => c.json({ private: true }));
    expect(() => app.apiRoutes.assertCoverage()).toThrow('Undeclared API handler');
    const duplicate = publicExample();
    duplicate.post('/v1/examples/:id', (c) => c.json({ private: true }));
    expect(() => duplicate.apiRoutes.assertCoverage()).toThrow('Undeclared API handler');
  });

  test('the runtime guard also catches routes added after app construction', async () => {
    const app = publicExample();
    app.get('/v1/undeclared', (c) => c.json({ private: true }));
    expect((await app.request('/v1/undeclared')).status).toBe(500);
  });

  test('manifest consumers cannot mutate the live authorization policy', async () => {
    const app = publicExample();
    const manifest = app.apiRoutes.manifest;
    const entry = manifest.find((route) => route.path === example.path);
    if (!entry) throw new Error('Expected example route');
    entry.policy.bodyLimitBytes = 1;
    const response = await app.request('/v1/examples/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valid' }),
    });
    expect(response.status).toBe(200);
  });
});

test('module and platform routes cannot reuse an OpenAPI operation ID', () => {
  expect(() =>
    setup((api) => {
      const first = { ...example, operationId: 'sharedOperation' };
      const second = { ...first, path: '/v1/other-examples/{id}' };
      api.register(first, { kind: 'public', bodyLimitBytes: 128 }, (c) =>
        c.json({ id: 'first' }, 200),
      );
      api.register(second, { kind: 'public', bodyLimitBytes: 128 }, (c) =>
        c.json({ id: 'second' }, 200),
      );
    }),
  ).toThrow('Duplicate API operation ID');
});

test('module hooks cannot shadow a generic route by renaming its path parameter', () => {
  expect(() =>
    setup((api) => {
      api.register(example, { kind: 'public', bodyLimitBytes: 128 }, (c) =>
        c.json({ id: 'first' }, 200),
      );
      api.register(
        {
          ...example,
          path: '/v1/examples/{key}',
          request: { params: z.object({ key: z.string() }) },
        },
        {
          kind: 'management',
          bodyLimitBytes: 128,
          session: { role: 'owner' },
          isolationCase: 'shadow',
        },
        (c) => c.json({ id: 'shadow' }, 200),
      );
    }),
  ).toThrow('Duplicate API operation');
});
