import { expect } from 'bun:test';

import type { AuthFixture } from './auth-fixture.ts';

type PublicRequest = Readonly<{
  path: string;
  method?: string;
  headers?: NonNullable<RequestInit['headers']>;
  body?: unknown;
}>;

/**
 * How a public operation proves I5 (only explicitly public data):
 * - `fields`: every JSON leaf path of the response is in the test's own allowlist;
 * - `static`: a credential-free document that is identical with and without a session and
 *   contains none of the fixture's tenant identifiers or emails;
 * - `empty`: no body at all (e.g. CORS preflight).
 */
export type PublicResponseCase = Readonly<
  | { kind: 'fields'; request: PublicRequest; fields: readonly string[] }
  | { kind: 'static'; request: PublicRequest }
  | { kind: 'empty'; request: PublicRequest; status: number }
>;
export type PublicResponseCases = Readonly<Record<string, PublicResponseCase>>;
export type PublicOperation = Readonly<{ method: string; path: string }>;

const identity = (operation: PublicOperation) => `${operation.method} ${operation.path}`;

/** A public operation without a case fails, including routes added after the cases were written. */
export function assertPublicResponseCoverage(
  operations: readonly PublicOperation[],
  cases: PublicResponseCases,
): void {
  const keys = new Set(operations.map(identity));
  for (const key of keys) if (!cases[key]) throw new Error(`Missing public response case: ${key}`);
  for (const key of Object.keys(cases))
    if (!keys.has(key)) throw new Error(`Stale public response case: ${key}`);
}

/** Leaf paths with `[]` for array items, so an allowlist covers every element. */
export function jsonFieldPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => jsonFieldPaths(item, `${prefix}[]`));
  if (value !== null && typeof value === 'object')
    return Object.entries(value).flatMap(([key, item]) =>
      jsonFieldPaths(item, prefix ? `${prefix}.${key}` : key),
    );
  return [prefix];
}

export function assertAllowedFields(value: unknown, fields: readonly string[]): void {
  const allowed = new Set(fields);
  const extra = [...new Set(jsonFieldPaths(value))].filter((path) => !allowed.has(path));
  if (extra.length)
    throw new Error(`Public response has fields outside its allowlist: ${extra.join(', ')}`);
}

export async function exercisePublicResponse(
  fixture: AuthFixture,
  testCase: PublicResponseCase,
  context: { cookie: string; tenantValues: readonly string[] },
): Promise<void> {
  const { path, method, headers, body: requestBody } = testCase.request;
  const send = (cookie?: string) => fixture.request(path, requestBody, cookie, headers, method);
  const response = await send();
  if (testCase.kind === 'empty') {
    expect(response.status).toBe(testCase.status);
    expect(await response.text()).toBe('');
    return;
  }
  expect(response.status).toBe(200);
  const body = await response.text();
  if (testCase.kind === 'fields') {
    assertAllowedFields(JSON.parse(body), testCase.fields);
    return;
  }
  expect(await (await send(context.cookie)).text()).toBe(body);
  for (const value of context.tenantValues) expect(body).not.toContain(value);
}
