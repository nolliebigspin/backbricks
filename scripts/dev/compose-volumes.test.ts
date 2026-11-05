/**
 * Bun's isolated linker writes a node_modules folder per workspace. Each needs its own volume
 * in compose.yaml, or containers would write Linux binaries into the host's checkout (and the
 * host's macOS binaries would break the containers). Fails when a workspace is added without
 * its volume.
 */
import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import rootPackage from '../../package.json';

const repoRoot = join(import.meta.dir, '../..');

// Only the parts of compose.yaml this test reads.
const composeFile = z.object({
  'x-bun': z.object({ volumes: z.array(z.string()) }),
  services: z.record(
    z.string(),
    z.object({ image: z.string().optional(), volumes: z.array(z.string()).optional() }),
  ),
  volumes: z.record(z.string(), z.unknown()),
});

const compose = composeFile.parse(
  Bun.YAML.parse(await Bun.file(join(repoRoot, 'compose.yaml')).text()),
);

const workspaces = rootPackage.workspaces
  .flatMap((pattern) =>
    Array.from(new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: repoRoot })),
  )
  .map((file) => dirname(file))
  .toSorted();

const mounts = new Map(
  compose['x-bun'].volumes.map((volume) => {
    const [source = '', target = ''] = volume.split(':');
    return [target, source];
  }),
);

describe('compose.yaml node_modules volumes', () => {
  test('the root has its own node_modules volume', () => {
    expect(mounts.get('/app/node_modules')).toBe('nm-root');
  });

  test.each(workspaces)('%s has its own node_modules volume', (workspace) => {
    const volume = mounts.get(`/app/${workspace}/node_modules`);
    const expected = `nm-${workspace.replaceAll('/', '-')}`;
    expect(volume).toBe(expected);
    expect(Object.keys(compose.volumes)).toContain(expected);
  });

  test('every service running Bun mounts the full volume list', () => {
    for (const [name, service] of Object.entries(compose.services)) {
      if (service.image?.startsWith('oven/bun')) {
        expect({ name, volumes: service.volumes }).toEqual({
          name,
          volumes: compose['x-bun'].volumes,
        });
      }
    }
  });
});
