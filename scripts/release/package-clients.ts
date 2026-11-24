import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { REPOSITORY_ROOT } from '../api/paths.ts';

const version = z.string().regex(/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/);
const manifestSchema = z.object({
  name: z.string(),
  version,
  description: z.string(),
  license: z.literal('MIT'),
  type: z.literal('module'),
  engines: z.object({ node: z.string() }),
  dependencies: z.record(z.string(), z.string()),
});

async function command(args: string[], cwd: string) {
  const proc = Bun.spawn(args, { cwd, stdout: 'inherit', stderr: 'inherit' });
  if ((await proc.exited) !== 0) throw new Error('Client packaging command failed.');
}

async function rebaseDeclarations(directory: string, contract: string) {
  const files = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    files.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return rebaseDeclarations(path, contract);
      if (entry.name.endsWith('.d.ts')) {
        const content = await readFile(path, 'utf8');
        if (content.includes('@backbricks/api-contract'))
          await writeFile(path, content.replaceAll('@backbricks/api-contract', contract));
      }
    }),
  );
}

function sdkEntry(directory: string) {
  return {
    types: `./dist/types/${directory}/index.d.ts`,
    default: `./dist/${directory}/index.js`,
  };
}

/** Prepare installable artifacts. Registry ownership and publication are separate. */
export async function packageClients(releaseVersion?: string) {
  const output = join(REPOSITORY_ROOT, 'dist/clients');
  const sdk = join(REPOSITORY_ROOT, 'packages/sdk');
  const cli = join(REPOSITORY_ROOT, 'packages/cli');
  const sdkStage = join(output, 'sdk');
  const cliStage = join(output, 'cli');
  await Promise.all([sdkStage, cliStage].map((path) => rm(path, { recursive: true, force: true })));
  await Promise.all([sdkStage, cliStage].map((path) => mkdir(path, { recursive: true })));
  const [sdkManifest, cliManifest] = await Promise.all(
    [sdk, cli].map(async (cwd) =>
      manifestSchema.parse(await Bun.file(join(cwd, 'package.json')).json()),
    ),
  );
  if (!sdkManifest || !cliManifest) throw new Error('Client manifests are missing.');
  await Promise.all([command(['bun', 'run', 'build'], sdk), command(['bun', 'run', 'build'], cli)]);
  await command(['bunx', '--no-install', 'tsc', '-p', 'tools/tsconfig.declarations.json'], sdk);
  await Promise.all([
    cp(join(sdk, 'dist'), join(sdkStage, 'dist'), { recursive: true }),
    cp(join(cli, 'dist'), join(cliStage, 'dist'), { recursive: true }),
    copyFile(join(sdk, 'LICENSE'), join(sdkStage, 'LICENSE')),
    copyFile(join(cli, 'LICENSE'), join(cliStage, 'LICENSE')),
    copyFile(join(sdk, 'README.md'), join(sdkStage, 'README.md')),
    copyFile(join(cli, 'README.md'), join(cliStage, 'README.md')),
    copyFile(join(cli, 'ADMIN.md'), join(cliStage, 'ADMIN.md')),
  ]);
  const types = join(sdkStage, 'dist/types');
  await Promise.all([
    copyFile(
      join(REPOSITORY_ROOT, 'packages/api-contract/src/generated.ts'),
      join(types, 'api-contract.d.ts'),
    ),
    ...['src', 'admin', 'pow'].map((directory) =>
      rebaseDeclarations(join(types, directory), '../api-contract.js'),
    ),
  ]);

  const pin = sdkManifest.dependencies['openapi-fetch'];
  if (!pin) throw new Error('The SDK management dependency is missing.');
  const effectiveVersion = releaseVersion === undefined ? undefined : version.parse(releaseVersion);
  await writeFile(
    join(sdkStage, 'package.json'),
    JSON.stringify(
      {
        ...sdkManifest,
        version: effectiveVersion ?? sdkManifest.version,
        exports: { '.': sdkEntry('src'), './admin': sdkEntry('admin'), './pow': sdkEntry('pow') },
        dependencies: { 'openapi-fetch': pin },
      },
      null,
      2,
    ),
  );
  const { dependencies: _bundled, ...cliPackage } = cliManifest;
  await writeFile(
    join(cliStage, 'package.json'),
    JSON.stringify(
      {
        ...cliPackage,
        version: effectiveVersion ?? cliManifest.version,
        bin: { backbricks: './dist/backbricks.js' },
      },
      null,
      2,
    ),
  );
  await command(['npm', 'pack', '--pack-destination', output], sdkStage);
  await command(['npm', 'pack', '--pack-destination', output], cliStage);
}

if (import.meta.main) await packageClients(process.argv[2]);
