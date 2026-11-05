/** Keeps `.env.example` (the documentation of every variable) valid against the schema. */
import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { formatConfigIssues, loadConfig } from './load.ts';
import { CONFIG_VARIABLES } from './schema.ts';

const example = await Bun.file(join(import.meta.dir, '../../../../.env.example')).text();
const env = Object.fromEntries(
  example
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);

test('.env.example is a valid configuration with every module enabled', () => {
  const result = loadConfig(env, {
    uploads: [{ service: 'storage' }, { service: 'scanner', optional: true }],
    forms: [],
    reviews: [],
  });
  if (!result.ok) throw new Error(formatConfigIssues(result.issues));
  expect(result.config.modules).toEqual(['uploads', 'forms', 'reviews']);
});

test('.env.example documents every config variable', () => {
  expect(Object.keys(env).toSorted()).toEqual([...CONFIG_VARIABLES].toSorted());
});
