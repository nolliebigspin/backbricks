import { expect, test } from 'bun:test';

import { exportOpenApi } from '../../apps/server/src/openapi.ts';

test('offline OpenAPI export is deterministic, matches committed routes and exposes no runtime internals', async () => {
  const first = await exportOpenApi();
  expect(await exportOpenApi()).toBe(first);
  const generated = JSON.parse(first) as unknown;
  expect(
    await Bun.file(new URL('../../packages/api-contract/openapi.json', import.meta.url)).json(),
  ).toEqual(generated);
  expect(first).toContain('"/v1/projects"');
  expect(first).toContain('"/v1/projects/{projectId}/config"');
  expect(first).not.toContain('isolationCase');
  expect(first).not.toContain('/api/auth/');
  expect(first).not.toContain('/samples/');
  expect(first).not.toContain('offline-contract-generation-only-not-a-secret');
});

test('the generator resolves its pinned TypeScript fallback locally', async () => {
  const manifest = await Bun.file(
    new URL('../../packages/api-contract/package.json', import.meta.url),
  ).json();
  const child = Bun.spawn(
    ['bun', '-e', 'import ts from "typescript"; process.stdout.write(ts.version);'],
    {
      cwd: new URL('../../packages/api-contract', import.meta.url).pathname,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe(manifest.devDependencies.typescript);
});

test('problem status and code are extensible on the wire while known catalog values remain documented', async () => {
  const { z } = await import('zod');
  const { ERROR_CODES } = await import('../../packages/core/src/index.ts');
  const record = z.record(z.string(), z.unknown());
  const nested = (value: unknown, path: readonly string[]) =>
    path.reduce((item, key) => record.parse(item)[key], value);
  const document: unknown = JSON.parse(await exportOpenApi());
  const properties = [
    'paths',
    '/v1/meta',
    'get',
    'responses',
    'default',
    'content',
    'application/problem+json',
    'schema',
    'properties',
  ];
  expect(nested(document, [...properties, 'status'])).toMatchObject({
    type: 'integer',
    minimum: 100,
    maximum: 599,
  });
  expect(nested(document, [...properties, 'code'])).toMatchObject({
    type: 'string',
    'x-extensible-enum': Object.keys(ERROR_CODES),
  });
});
