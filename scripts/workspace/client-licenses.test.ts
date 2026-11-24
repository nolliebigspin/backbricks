// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test } from 'bun:test';
import { access, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

const manifest = z.object({
  name: z.string(),
  license: z.string(),
  dependencies: z.record(z.string(), z.string()).default({}),
  optionalDependencies: z.record(z.string(), z.string()).default({}),
});
const permissive =
  /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|CC0-1\.0|Unlicense)(?: OR .+)?$/;
const root = join(import.meta.dir, '../..');

async function manifestFor(directory: string, dependency: string): Promise<string | undefined> {
  let current = directory;
  while (true) {
    const file = join(current, 'node_modules', dependency, 'package.json');
    // oxlint-disable-next-line no-await-in-loop -- Resolve as Node does, nearest package first.
    const exists = await access(file).then(
      () => true,
      () => false,
    );
    if (exists) return realpath(file);
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

test('published client runtime dependencies have compatible SPDX licenses', async () => {
  const pending = [
    join(root, 'packages/cli/package.json'),
    join(root, 'packages/sdk/package.json'),
  ];
  const seen = new Set<string>();
  while (pending.length) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    // oxlint-disable-next-line no-await-in-loop -- Traverse the installed runtime closure.
    const pkg = manifest.parse(await Bun.file(file).json());
    expect(pkg.license, pkg.name).toMatch(permissive);
    // oxlint-disable-next-line no-await-in-loop -- Traverse the installed runtime closure.
    const dependencies = await Promise.all(
      Object.keys({ ...pkg.optionalDependencies, ...pkg.dependencies }).map(async (dependency) => {
        // The SDK's generated declaration input is erased from the runtime package.
        if (pkg.name === '@backbricks/sdk' && dependency === '@backbricks/api-contract')
          return undefined;
        const target = await manifestFor(dirname(file), dependency);
        if (!target && dependency in pkg.dependencies && !(dependency in pkg.optionalDependencies))
          throw new Error(`Missing runtime dependency ${dependency} of ${pkg.name}.`);
        return target;
      }),
    );
    pending.push(...dependencies.filter((path) => path !== undefined));
  }
});
