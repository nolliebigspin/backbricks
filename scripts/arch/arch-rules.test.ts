/**
 * Proves the architecture rules in .dependency-cruiser.json fire: each fixture under
 * ./fixtures is a tiny repo-shaped tree with one deliberate violation (I13, I18, ADR-0001,
 * AGENTS.md §2.1/§2.4). Fixtures use relative imports so they need no node_modules.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../..');
const depcruise = join(repoRoot, 'node_modules/.bin/depcruise');
const config = join(repoRoot, '.dependency-cruiser.json');

type CruiseResult = { summary: { violations: { rule: { name: string } }[] } };

async function violatedRules(fixture: string): Promise<string[]> {
  const cwd = join(import.meta.dir, 'fixtures', fixture);
  const roots = ['apps', 'packages'].filter(
    (dir) => new Bun.Glob(`${dir}/**/*.ts`).scanSync({ cwd }).next().done === false,
  );
  const proc = Bun.spawn([depcruise, ...roots, '--config', config, '--output-type', 'json'], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  const result: CruiseResult = JSON.parse(output);
  return [...new Set(result.summary.violations.map((violation) => violation.rule.name))].toSorted();
}

describe('architecture rules (lint:arch)', () => {
  test('a tree without violations passes', async () => {
    expect(await violatedRules('clean')).toEqual([]);
  });

  const cases: [fixture: string, rule: string][] = [
    ['direct-tenant-table', 'tenant-tables-only-repositories'],
    ['module-type-import-db', 'modules-only-core'],
    ['module-defines-table', 'modules-no-database'],
    ['core-imports-db', 'core-no-internal-deps'],
    ['sdk-imports-core', 'clients-only-contract'],
    ['www-imports-core', 'www-only-ui'],
    ['web-imports-server', 'web-only-ui-and-contract'],
    ['web-imports-server', 'no-app-imports'],
    ['deep-import', 'no-deep-imports'],
    ['deep-import', 'no-relative-imports-across-packages'],
    ['circular', 'no-circular'],
  ];

  for (const [fixture, rule] of cases) {
    test(`${fixture} violates ${rule}`, async () => {
      expect(await violatedRules(fixture)).toContain(rule);
    });
  }
});
