import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { checkApiDrift } from './check.ts';
import { apiArtifacts, REPOSITORY_ROOT } from './paths.ts';

test('drift checks fail on an edited generated artifact without overwriting it', async () => {
  await mkdir(join(REPOSITORY_ROOT, '.turbo'), { recursive: true });
  const directory = await mkdtemp(join(REPOSITORY_ROOT, '.turbo/api-drift-fixture-'));
  const paths = {
    contract: join(directory, 'openapi.json'),
    types: join(directory, 'generated.ts'),
  };
  try {
    const real = apiArtifacts();
    await Promise.all([
      Bun.write(paths.contract, Bun.file(real.contract)),
      Bun.write(paths.types, Bun.file(real.types)),
    ]);
    await checkApiDrift(paths);
    const changed = `${await Bun.file(paths.types).text()}\n// deliberate fixture drift\n`;
    await Bun.write(paths.types, changed);
    expect(await checkApiDrift(paths).catch((error: unknown) => error)).toMatchObject({
      message: expect.stringContaining('Generated API artifacts drifted'),
    });
    expect(await Bun.file(paths.types).text()).toBe(changed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
