import { expect, test } from 'bun:test';

import { BackbricksError, createClient } from '@backbricks/sdk';
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

import { solveChallenge } from './pow.ts';

declare module '@backbricks/sdk' {
  interface BackbricksSchema {
    'forms/typed': { name: string; privacy: true };
  }
}

function compileOnly(client: ReturnType<typeof createClient>) {
  void client.forms.submit('typed', { name: 'Ada', privacy: true });
  // @ts-expect-error Generated form types reject missing required fields.
  void client.forms.submit('typed', { name: 'Ada' });
  // Forms without generated types accept any values.
  void client.forms.submit('untyped', { anything: 1 });
}
void compileOnly;

test('solutions verify with the server library (ALTCHA v2, SHA-256)', async () => {
  const challenge = await createChallenge({
    algorithm: 'SHA-256',
    cost: 50,
    keyPrefix: '00',
    deriveKey,
    expiresAt: new Date(Date.now() + 60_000),
    hmacSignatureSecret: 'sdk-test-secret',
  });
  const solution = await solveChallenge(challenge);
  const result = await verifySolution({
    challenge,
    solution,
    deriveKey,
    hmacSignatureSecret: 'sdk-test-secret',
  });
  expect(result.verified).toBe(true);
});

test('an aborted solve stops', async () => {
  const challenge = await createChallenge({ algorithm: 'SHA-256', cost: 1, deriveKey });
  const controller = new AbortController();
  controller.abort();
  expect(solveChallenge(challenge, { signal: controller.signal })).rejects.toThrow();
});

type Seen = { method: string; path: string; headers: Headers; body: unknown };

/** A stand-in API that records requests; the real server is exercised in apps/server. */
function fakeApi(submit: (seen: Seen) => Response) {
  const seen: Seen[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url);
      const entry = {
        method: request.method,
        path: `${url.pathname}${url.search}`,
        headers: request.headers,
        body: request.method === 'POST' ? await request.json() : undefined,
      };
      seen.push(entry);
      if (url.pathname === '/api/v1/public/challenge')
        return Response.json(
          await createChallenge({ algorithm: 'SHA-256', cost: 5, keyPrefix: '0', deriveKey }),
        );
      return submit(entry);
    },
  });
  return { server, seen, baseUrl: `${server.url.origin}/api` };
}

test('publishable keys solve a challenge, then submit data, proof and options', async () => {
  const api = fakeApi(() => Response.json({ id: 'sub_1' }));
  try {
    const client = createClient({ publishableKey: 'bb_pk_fixture', baseUrl: `${api.baseUrl}/v1/` });
    const result = await client.forms.submit(
      'contact form',
      { name: 'Ada' },
      { idempotencyKey: 'retry-1', honeypot: '' },
    );
    expect(result).toEqual({ id: 'sub_1' });
    const [challenge, submission] = api.seen;
    expect(challenge?.path).toBe('/api/v1/public/challenge');
    expect(challenge?.headers.get('authorization')).toBe('Bearer bb_pk_fixture');
    expect(submission?.path).toBe('/api/v1/public/forms/contact%20form/submissions');
    expect(submission?.headers.get('idempotency-key')).toBe('retry-1');
    expect(submission?.headers.get('content-type')).toBe('application/json');
    expect(submission?.body).toMatchObject({
      data: { name: 'Ada' },
      honeypot: '',
      proof: { challenge: { parameters: { algorithm: 'SHA-256' } }, solution: {} },
    });
  } finally {
    await api.server.stop();
  }
});

test('secret keys skip proof-of-work and the base URL may omit /v1', async () => {
  const api = fakeApi(() => Response.json({ accepted: true }));
  try {
    const client = createClient({ secretKey: 'bb_sk_fixture', baseUrl: api.baseUrl });
    expect(await client.forms.submit('contact', { name: 'Ada' })).toEqual({ accepted: true });
    expect(api.seen.map((entry) => entry.path)).toEqual([
      '/api/v1/public/forms/contact/submissions',
    ]);
    expect(api.seen[0]?.body).toEqual({ data: { name: 'Ada' } });
  } finally {
    await api.server.stop();
  }
});

test('problems become BackbricksError with field errors and the request ID', async () => {
  const api = fakeApi(() =>
    Response.json(
      {
        type: 'https://errors.backbricks.dev/validation_failed',
        title: 'Validation failed',
        status: 422,
        code: 'validation_failed',
        detail: 'Some fields are invalid.',
        hint: 'GET /v1/public/forms/contact',
        requestId: 'req_fixture',
        errors: [{ path: 'email', code: 'invalid_email', message: 'Enter an email address.' }],
      },
      { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  );
  try {
    const client = createClient({ secretKey: 'bb_sk_fixture', baseUrl: api.baseUrl });
    const error = await client.forms.submit('contact', { email: 'nope' }).catch((cause) => cause);
    expect(error).toBeInstanceOf(BackbricksError);
    expect(error).toMatchObject({
      code: 'validation_failed',
      status: 422,
      requestId: 'req_fixture',
      message: 'Some fields are invalid.',
      fieldErrors: [{ path: 'email', code: 'invalid_email', message: 'Enter an email address.' }],
    });
  } finally {
    await api.server.stop();
  }
});

test('unreachable servers raise network_error', async () => {
  const client = createClient({
    secretKey: 'bb_sk_fixture',
    baseUrl: 'http://127.0.0.1:9',
    fetch: () => Promise.reject(new TypeError('connection refused')),
  });
  expect(client.forms.submit('contact', {})).rejects.toMatchObject({
    code: 'network_error',
    status: 0,
  });
});

test('the built root entry imports nothing and submits from Node', async () => {
  const built = await Bun.file(new URL('../dist/src/index.js', import.meta.url)).text();
  expect(built).not.toMatch(/^\s*import\s/m);
  expect(built).not.toMatch(/\brequire\(/);
  const api = fakeApi(() => Response.json({ id: 'sub_node' }));
  try {
    const child = Bun.spawn(
      [
        'node',
        '--input-type=module',
        '-e',
        'import { createClient } from "@backbricks/sdk"; const result = await createClient({ publishableKey: "bb_pk_fixture", baseUrl: process.argv[1] }).forms.submit("contact", { name: "Ada" }); if (result.id !== "sub_node") process.exit(1);',
        api.baseUrl,
      ],
      { cwd: new URL('../', import.meta.url).pathname, stdout: 'pipe', stderr: 'pipe' },
    );
    const exited = await child.exited;
    expect({ exited, stderr: await new Response(child.stderr).text() }).toEqual({
      exited: 0,
      stderr: '',
    });
  } finally {
    await api.server.stop();
  }
});
