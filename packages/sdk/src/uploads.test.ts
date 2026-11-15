import { expect, test } from 'bun:test';

import { createClient, BackbricksError, type UploadProgress } from '@backbricks/sdk';
import { createChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

declare module '@backbricks/sdk' {
  interface BackbricksSchema {
    'upload-zones/typed-cv': { name: string; size: number; type: 'application/pdf' };
  }
}
function compileOnly(client: ReturnType<typeof createClient>) {
  void client.uploads.upload('typed-cv', new Blob(['%PDF'], { type: 'application/pdf' }), {
    name: 'cv.pdf',
    type: 'application/pdf',
  });
  // @ts-expect-error Generated upload declarations restrict explicit MIME choices.
  void client.uploads.upload('typed-cv', new Blob(['x']), { name: 'x.html', type: 'text/html' });
}
void compileOnly;
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected failure.');
}
const file = () => new File(['%PDF-1.7\nfixture\n%%EOF'], 'cv.pdf', { type: 'application/pdf' });
type Call = { url: string; init: RequestInit; body: unknown };
function api(
  options: {
    states?: string[];
    putFailure?: boolean;
    problem?: boolean;
    onComplete?: () => void;
    wrongId?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  let complete = 0;
  const send = async (url: string, init: RequestInit) => {
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url, init, body });
    const path = new URL(url).pathname;
    if (path.endsWith('/challenge'))
      return Response.json(
        await createChallenge({ algorithm: 'SHA-256', cost: 1, keyPrefix: '0', deriveKey }),
      );
    if (path.endsWith('/complete')) {
      options.onComplete?.();
      const status = options.states?.[complete++] ?? 'ready';
      return Response.json({
        fileId: options.wrongId ? 'file_foreign' : 'file_fixture',
        fileRef: 'opaque-reference',
        status,
      });
    }
    if (init.method === 'PUT') {
      if (options.putFailure) throw new Error('do not expose signed-provider-secret');
      return new Response(null, { status: 200 });
    }
    if (options.problem)
      return Response.json(
        {
          code: 'validation_failed',
          errors: [{ path: 'size', code: 'too_large' }],
          requestId: 'req_test',
        },
        { status: 422 },
      );
    return Response.json({
      fileId: 'file_fixture',
      uploadToken: 'private-token',
      uploadUrl: 'https://storage.example/part?provider=signed',
      headers: { 'content-type': 'application/pdf', 'content-length': String(file().size) },
      expiresAt: '2027-01-01T00:00:00Z',
    });
  };
  return { calls, send };
}
test('upload makes one intent and PUT, solves fresh proofs while polling and returns only a ready reference', async () => {
  const f = api({ states: ['uploaded', 'ready'] });
  const progress: UploadProgress[] = [];
  const result = await createClient({
    baseUrl: 'https://api.example/v1',
    publishableKey: 'bb_pk_fixture',
    fetch: f.send,
  }).uploads.upload('cv', file(), { onProgress: (event) => progress.push(event) });
  expect(result).toMatchObject({
    fileId: 'file_fixture',
    fileRef: 'opaque-reference',
    status: 'ready',
  });
  const puts = f.calls.filter((call) => call.init.method === 'PUT');
  expect(puts).toHaveLength(1);
  expect(puts[0]?.url).toBe('https://storage.example/part?provider=signed');
  expect(new Headers(puts[0]?.init.headers).get('authorization')).toBeNull();
  expect(puts[0]?.init.credentials).toBe('omit');
  expect(f.calls.filter((call) => new URL(call.url).pathname.endsWith('/challenge'))).toHaveLength(
    3,
  );
  expect(f.calls.filter((call) => new URL(call.url).pathname.endsWith('/files'))).toHaveLength(1);
  const proofs = f.calls
    .filter((call) => call.init.method === 'POST')
    .map((call) =>
      JSON.stringify(
        typeof call.body === 'object' && call.body !== null
          ? Reflect.get(call.body, 'proof')
          : null,
      ),
    );
  expect(new Set(proofs).size).toBe(3);
  expect(progress.map((event) => event.phase)).toEqual([
    'uploading',
    'uploading',
    'processing',
    'ready',
  ]);
  expect(progress.at(-1)).toEqual({ phase: 'ready', loaded: file().size, total: file().size });
});
test('structured validation and terminal scan failures stay typed and never retry the upload', async () => {
  for (const mode of ['problem', 'quarantined', 'rejected', 'provider'] as const) {
    const f = api({ problem: mode === 'problem', putFailure: mode === 'provider', states: [mode] });
    // oxlint-disable-next-line no-await-in-loop -- Each independent failure proves its complete request inventory.
    const error: unknown = await createClient({
      baseUrl: 'https://api.example',
      secretKey: 'bb_sk_fixture',
      fetch: f.send,
    })
      .uploads.upload('cv', file())
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BackbricksError);
    expect(JSON.stringify(error)).not.toContain('private-token');
    expect(JSON.stringify(error)).not.toContain('signed-provider-secret');
    expect(f.calls.filter((call) => new URL(call.url).pathname.endsWith('/files'))).toHaveLength(1);
    expect(f.calls.filter((call) => call.init.method === 'PUT').length).toBeLessThanOrEqual(1);
    if (mode === 'problem')
      expect(error).toMatchObject({
        code: 'validation_failed',
        requestId: 'req_test',
        fieldErrors: [{ path: 'size', code: 'too_large', message: '' }],
      });
    if (mode === 'quarantined' || mode === 'rejected')
      expect(error).toMatchObject({ code: `upload_${mode}` });
  }
});
test('abort during readiness and the operation deadline stop polling without replaying bytes', async () => {
  for (const timeout of [false, true]) {
    const controller = new AbortController();
    const f = api({
      states: ['uploaded'],
      onComplete: () => {
        if (!timeout)
          setTimeout(() => controller.abort(new DOMException('Canceled', 'AbortError')), 20);
      },
    });
    // oxlint-disable-next-line no-await-in-loop -- Each operation independently proves its deadline/cancellation boundary.
    const error: unknown = await createClient({
      baseUrl: 'https://api.example',
      secretKey: 'bb_sk_fixture',
      fetch: f.send,
    })
      .uploads.upload('cv', file(), { signal: controller.signal, timeoutMs: timeout ? 25 : 5000 })
      .catch((cause: unknown) => cause);
    if (timeout) expect(error).toMatchObject({ code: 'upload_timeout' });
    else expect(error).toMatchObject({ name: 'AbortError' });
    expect(f.calls.filter((call) => call.init.method === 'PUT')).toHaveLength(1);
    expect(f.calls.filter((call) => new URL(call.url).pathname.endsWith('/complete'))).toHaveLength(
      1,
    );
  }
});
test('pre-abort sends nothing, mismatched completion cannot be claimed, and Blob requires a name', async () => {
  const f = api();
  const client = createClient({
    baseUrl: 'https://api.example',
    secretKey: 'bb_sk_fixture',
    fetch: f.send,
  });
  const controller = new AbortController();
  controller.abort();
  expect(
    await failure(client.uploads.upload('cv', file(), { signal: controller.signal })),
  ).toMatchObject({ name: 'AbortError' });
  expect(f.calls).toHaveLength(0);
  expect(await failure(client.uploads.upload('cv', new Blob(['x'])))).toBeInstanceOf(TypeError);
  const wrong = api({ wrongId: true });
  expect(
    await failure(
      createClient({
        baseUrl: 'https://api.example',
        secretKey: 'bb_sk_fixture',
        fetch: wrong.send,
      }).uploads.upload('cv', file()),
    ),
  ).toMatchObject({ code: 'unexpected_response' });
});
test('abort propagates through proof and an in-flight provider PUT', async () => {
  for (const at of ['proof', 'put']) {
    const controller = new AbortController();
    const f = api();
    let reached: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const client = createClient({
      baseUrl: 'https://api.example',
      ...(at === 'proof' ? { publishableKey: 'bb_pk_fixture' } : { secretKey: 'bb_sk_fixture' }),
      fetch: (url, init) => {
        if (
          (at === 'proof' && url.includes('/challenge')) ||
          (at === 'put' && init.method === 'PUT')
        ) {
          reached?.();
          return new Promise<Response>((_, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            });
          });
        }
        return f.send(url, init);
      },
    });
    const pending = client.uploads.upload('cv', file(), { signal: controller.signal });
    // oxlint-disable-next-line no-await-in-loop -- Wait for the boundary under test before cancellation.
    await ready;
    controller.abort(new DOMException('Canceled', 'AbortError'));
    // oxlint-disable-next-line no-await-in-loop -- Await cancellation before testing the next boundary.
    const error = await failure(pending);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(f.calls.some((call) => call.url.includes('/complete'))).toBe(false);
  }
});

test('soft drops and malformed successful responses fail explicitly without a provider PUT', async () => {
  for (const body of [
    Response.json({ accepted: true }),
    new Response('<html>upstream error</html>'),
  ]) {
    let calls = 0;
    const client = createClient({
      baseUrl: 'https://api.example',
      secretKey: 'bb_sk_fixture',
      fetch: async () => {
        calls++;
        return body;
      },
    });
    // oxlint-disable-next-line no-await-in-loop -- Both response shapes must stop at the initial intent.
    const error = await failure(client.uploads.upload('cv', file()));
    expect(error).toBeInstanceOf(BackbricksError);
    expect(calls).toBe(1);
  }
});
