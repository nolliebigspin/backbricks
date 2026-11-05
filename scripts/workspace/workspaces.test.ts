/**
 * Keeps every workspace package consistent with LICENSING.md and the package conventions
 * (AGENTS.md §2.4, §5). LICENSING.md is the source of truth for which paths are MIT.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import rootPackage from '../../package.json';

const repoRoot = join(import.meta.dir, '../..');

type PackageJson = {
  name: string;
  private?: boolean;
  license?: string;
  type?: string;
  exports?: Record<string, string>;
  engines?: { node?: string };
};

/** MIT path patterns from the LICENSING.md table row whose license column is "MIT". */
async function mitPathPatterns(): Promise<string[]> {
  const licensing = await Bun.file(join(repoRoot, 'LICENSING.md')).text();
  const row = licensing.split('\n').find((line) => /\|\s*MIT\s*\|\s*`MIT`\s*\|\s*$/.test(line));
  if (!row) throw new Error('LICENSING.md: no table row for MIT found');
  const pathsColumn = row.split('|')[2] ?? '';
  return [...pathsColumn.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
}

async function workspaces(): Promise<{ dir: string; pkg: PackageJson }[]> {
  const result: { dir: string; pkg: PackageJson }[] = [];
  for (const pattern of rootPackage.workspaces) {
    for (const file of new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: repoRoot })) {
      const dir = dirname(file);
      // oxlint-disable-next-line no-await-in-loop
      const pkg: PackageJson = await Bun.file(join(repoRoot, file)).json();
      result.push({ dir, pkg });
    }
  }
  return result.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

const mitPatterns = await mitPathPatterns();
const packages = await workspaces();
const isMit = (dir: string) =>
  mitPatterns.some((pattern) => new Bun.Glob(pattern).match(dir) || dir === pattern);

describe('workspace packages', () => {
  test('the MIT row in LICENSING.md lists the client packages', () => {
    expect(mitPatterns).toContain('packages/sdk');
    expect(mitPatterns).toContain('packages/cli');
  });

  test('the architecture packages exist', () => {
    const dirs = packages.map(({ dir }) => dir);
    for (const expected of [
      'apps/server',
      'apps/web',
      'apps/www',
      'packages/core',
      'packages/db',
      'packages/auth',
      'packages/adapters',
      'packages/api-contract',
      'packages/sdk',
      'packages/cli',
      'packages/ui',
      'packages/modules/forms',
      'packages/modules/uploads',
      'packages/modules/reviews',
    ]) {
      expect(dirs).toContain(expected);
    }
  });

  for (const { dir, pkg } of packages) {
    describe(relative(repoRoot, join(repoRoot, dir)), () => {
      test('license matches LICENSING.md', () => {
        expect(pkg.license).toBe(isMit(dir) ? 'MIT' : 'AGPL-3.0-only');
      });

      test('naming follows the conventions', () => {
        if (dir === 'packages/cli') expect(pkg.name).toBe('backbricks');
        else if (dir.startsWith('packages/modules/'))
          expect(pkg.name).toBe(`@backbricks/module-${dir.split('/').at(-1)}`);
        else expect(pkg.name).toMatch(/^@backbricks\/[a-z0-9-]+$/);
      });

      test('is an ES module and not published by accident', () => {
        expect(pkg.type).toBe('module');
        expect(pkg.private).toBe(true);
      });

      if (isMit(dir)) {
        test('MIT package ships its own LICENSE and supports Node >= 20 (I18)', async () => {
          const license = join(repoRoot, dir, 'LICENSE');
          expect(existsSync(license)).toBe(true);
          expect(await Bun.file(license).text()).toStartWith('MIT License');
          expect(pkg.engines?.node).toBe('>=20');
        });
      }
    });
  }
});
