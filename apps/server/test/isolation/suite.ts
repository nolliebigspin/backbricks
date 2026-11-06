import { expect } from 'bun:test';

import type { AuthFixture } from '../auth-fixture.ts';

export type Operation = { method: string; path: string; isolationCase: string };
type RequestSpec = {
  path: string;
  body?: unknown;
  cookie?: string;
  headers?: NonNullable<RequestInit['headers']>;
};
export type Probe = RequestSpec | (() => RequestSpec | Promise<RequestSpec>);
type Denial = { request: Probe; status: number };
export type IsolationCase =
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
    };
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

/** Execute concrete resource/filter/mutation assertions selected from the actual route manifest. */
export async function exerciseIsolation(
  fixture: AuthFixture,
  testCase: IsolationCase,
  snapshot: () => Promise<unknown>,
  operation: Operation,
): Promise<void> {
  const call = async (probe: Probe) => {
    const request = typeof probe === 'function' ? await probe() : probe;
    const path = request.path.startsWith('/v1/') ? request.path : `/api/auth${request.path}`;
    const actual = new URL(path, fixture.origin).pathname.split('/');
    const expected = operation.path.split('/');
    const matches =
      actual.length === expected.length &&
      expected.every((part, i) => /^\{[^}]+\}$/.test(part) || part === actual[i]);
    if (!matches || operation.method !== (request.body === undefined ? 'GET' : 'POST'))
      throw new Error(`Isolation probe does not exercise: ${operation.method} ${operation.path}`);
    return fixture.request(request.path, request.body, request.cookie, request.headers);
  };
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
  for (const denied of testCase.denied) {
    // oxlint-disable-next-line no-await-in-loop -- Each denial must have its own before/after snapshot.
    const before = await snapshot();
    // oxlint-disable-next-line no-await-in-loop -- See above: preserve mutation ordering.
    expect((await call(denied.request)).status).toBe(denied.status);
    // oxlint-disable-next-line no-await-in-loop -- Detect writes to business data, identity state and audit.
    expect(await snapshot()).toEqual(before);
  }
  const response = await call(testCase.allowed);
  expect(response.status).toBe(200);
  await testCase.verify?.(response);
}
