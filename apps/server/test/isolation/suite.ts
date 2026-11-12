import { expect } from 'bun:test';

import type { AuthFixture } from '../auth-fixture.ts';

export type Operation = {
  method: string;
  path: string;
  isolationCase: string;
  /** Present when the route's policy accepts project-bound secret keys. */
  secretKeyScope?: string;
};
type RequestSpec = {
  path: string;
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: NonNullable<RequestInit['headers']>;
};
export type Probe = RequestSpec | (() => RequestSpec | Promise<RequestSpec>);
type Denial = { request: Probe; status: number };
export type IsolationCase = (
  | {
      kind: 'resource';
      own: Probe;
      foreign: Probe;
      beforeForeign?: () => Promise<void>;
      afterForeign?: () => Promise<void>;
    }
  | { kind: 'collection'; read: Probe; present: string[]; absent: string[]; foreign?: Probe }
  | {
      kind: 'mutation';
      denied: readonly [Denial, ...Denial[]];
      allowed: Probe;
      verify?: (response: Response) => Promise<void>;
    }
  | {
      kind: 'creation';
      denied: readonly [Denial, ...Denial[]];
      allowed: Probe;
      verify: (response: Response) => Promise<void>;
    }
) & { successStatus?: 200 | 201 | 202 | 204 };
export type Cases = Readonly<Record<string, IsolationCase>>;

/** Missing cases are a test failure, including operations added after the fixture was written. */
export function assertIsolationCoverage(operations: readonly Operation[], cases: Cases): void {
  const identities = new Set<string>();
  const fixtures = new Set<string>();
  for (const operation of operations) {
    const key = `${operation.method} ${operation.path}`;
    if (identities.has(key)) throw new Error(`Duplicate management operation: ${key}`);
    identities.add(key);
    if (fixtures.has(operation.isolationCase)) throw new Error(`Reused isolation fixture: ${key}`);
    fixtures.add(operation.isolationCase);
    if (!operation.isolationCase || !cases[operation.isolationCase])
      throw new Error(`Missing isolation fixture: ${key}`);
  }
}

const resolve = async (probe: Probe) => (typeof probe === 'function' ? await probe() : probe);

/** Send a probe only if it targets the operation under test, so a case can't drift to another route. */
async function send(fixture: AuthFixture, operation: Operation, probe: Probe) {
  const request = await resolve(probe);
  const path = request.path.startsWith('/v1/') ? request.path : `/api/auth${request.path}`;
  const actual = new URL(path, fixture.origin).pathname.split('/');
  const expected = operation.path.split('/');
  const matches =
    actual.length === expected.length &&
    expected.every((part, i) => /^\{[^}]+\}$/.test(part) || part === actual[i]);
  if (
    !matches ||
    operation.method !== (request.method ?? (request.body === undefined ? 'GET' : 'POST'))
  )
    throw new Error(`Isolation probe does not exercise: ${operation.method} ${operation.path}`);
  return fixture.request(
    request.path,
    request.body,
    request.cookie,
    request.headers,
    request.method,
  );
}

async function denied(
  call: (probe: Probe) => Promise<Response>,
  snapshot: () => Promise<unknown>,
  probe: Probe,
  status: number,
) {
  const before = await snapshot();
  expect((await call(probe)).status).toBe(status);
  // Detect writes to business data, identity state and audit.
  expect(await snapshot()).toEqual(before);
}

/** Execute concrete resource/filter/mutation assertions selected from the actual route manifest. */
export async function exerciseIsolation(
  fixture: AuthFixture,
  testCase: IsolationCase,
  snapshot: () => Promise<unknown>,
  operation: Operation,
): Promise<void> {
  const call = (probe: Probe) => send(fixture, operation, probe);
  if (testCase.kind === 'resource') {
    expect((await call(testCase.own)).status).toBe(200);
    await testCase.beforeForeign?.();
    try {
      expect((await call(testCase.foreign)).status).toBe(404);
    } finally {
      await testCase.afterForeign?.();
    }
    return;
  }
  if (testCase.kind === 'collection') {
    const response = await call(testCase.read);
    expect(response.status).toBe(200);
    const body = await response.text();
    for (const value of testCase.present) expect(body).toContain(value);
    for (const value of testCase.absent) expect(body).not.toContain(value);
    if (testCase.foreign) expect((await call(testCase.foreign)).status).toBe(404);
    return;
  }
  // Sequential denials make any unexpected write attributable to the request that caused it.
  for (const denial of testCase.denied)
    // oxlint-disable-next-line no-await-in-loop -- Each denial must have its own before/after snapshot.
    await denied(call, snapshot, denial.request, denial.status);
  const response = await call(testCase.allowed);
  expect(response.status).toBe(testCase.successStatus ?? 200);
  await testCase.verify?.(response);
}

export type KeyProbes = Readonly<{
  /** Fixture projects across both organizations; key probes move between them. */
  projects: readonly Readonly<{ id: string; organizationId: string }>[];
  /** A live secret key bound to the project with exactly this scope, already used once. */
  token(projectId: string, scope: string): Promise<string>;
}>;

/**
 * Re-run a cookie case with a project-bound secret key (review M3): the key reaches its own project,
 * while the same request moved to the sibling project or the foreign organization returns 404 and
 * writes nothing. Mutations are probed only with denials, so stateful allowed steps run once.
 */
export async function exerciseKeyIsolation(
  fixture: AuthFixture,
  testCase: IsolationCase,
  snapshot: () => Promise<unknown>,
  operation: Operation,
  keys: KeyProbes,
): Promise<void> {
  const scope = operation.secretKeyScope;
  const missing = () =>
    new Error(`Missing key isolation probe: ${operation.method} ${operation.path}`);
  if (!scope) throw missing();
  const own = await resolve(
    testCase.kind === 'resource'
      ? testCase.own
      : testCase.kind === 'collection'
        ? testCase.read
        : testCase.allowed,
  );
  const project = keys.projects.find(
    (entry) => /^\/v1\/projects\/([^/?]+)/.exec(own.path)?.[1] === entry.id,
  );
  const sibling = keys.projects.find(
    (entry) => entry.organizationId === project?.organizationId && entry.id !== project?.id,
  );
  const foreign = keys.projects.find((entry) => entry.organizationId !== project?.organizationId);
  if (!project || !sibling || !foreign) throw missing();
  const token = await keys.token(project.id, scope);
  const withKey = (spec: RequestSpec): RequestSpec => {
    const headers = new Headers(spec.headers);
    headers.set('authorization', `Bearer ${token}`);
    return { ...spec, cookie: undefined, headers };
  };
  const moved = (target: { id: string }) =>
    withKey({
      ...own,
      path: own.path.replace(`/v1/projects/${project.id}`, `/v1/projects/${target.id}`),
    });
  const call = (probe: Probe) => send(fixture, operation, probe);
  const foreignProbes = [moved(sibling), moved(foreign)];
  if (testCase.kind === 'resource') foreignProbes.push(withKey(await resolve(testCase.foreign)));
  if (testCase.kind === 'collection' && testCase.foreign)
    foreignProbes.push(withKey(await resolve(testCase.foreign)));
  for (const probe of foreignProbes)
    // oxlint-disable-next-line no-await-in-loop -- Each denial must have its own before/after snapshot.
    await denied(call, snapshot, probe, 404);
  if (testCase.kind === 'resource') expect((await call(withKey(own))).status).toBe(200);
  if (testCase.kind === 'collection') {
    const response = await call(withKey(own));
    expect(response.status).toBe(200);
    const body = await response.text();
    for (const value of testCase.present) expect(body).toContain(value);
    for (const value of testCase.absent) expect(body).not.toContain(value);
  }
}
