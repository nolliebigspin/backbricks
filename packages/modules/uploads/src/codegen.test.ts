import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { ConfiguredInstance } from '@backbricks/core';

import { uploadsCodegen, uploadsConfigSchema, type UploadsConfig } from './index.ts';

function zone(key: string, presets: UploadsConfig['presets']): ConfiguredInstance<UploadsConfig> {
  const at = new Date('2026-11-15T00:00:00Z');
  return {
    id: `mod_${key}`,
    organizationId: 'org',
    projectId: 'prj',
    moduleType: 'uploads',
    key,
    name: 'Private owner text */ never emit',
    status: 'active',
    config: uploadsConfigSchema.parse({ presets }),
    configVersion: 1,
    moduleVersion: 1,
    createdAt: at,
    updatedAt: at,
  };
}

test('codegen emits only zone key and permitted MIME types, with no runtime imports', () => {
  const generated = uploadsCodegen(zone('cv', ['pdf']));
  expect(generated).toContain('"upload-zones/cv"');
  expect(generated).toContain('"application/pdf"');
  expect(generated).not.toContain('image/png');
  expect(generated).not.toContain('Private owner');
  expect(generated).not.toContain('@backbricks/core');
});

test('multiple generated zone declarations compile and reject invalid MIME and unknown zones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'uploads-codegen-'));
  try {
    const files = {
      'sdk.d.ts': `declare module '@backbricks/sdk' {
        export interface BackbricksSchema {}
        export function declareUpload<K extends keyof BackbricksSchema>(key: K, value: BackbricksSchema[K]): void;
      }`,
      'generated.ts': [
        uploadsCodegen(zone('cv', ['pdf'])),
        uploadsCodegen(zone('photos', ['images'])),
      ].join('\n'),
      'usage.ts': `import { declareUpload } from '@backbricks/sdk';
        declareUpload('upload-zones/cv', { name: 'cv.pdf', size: 1, type: 'application/pdf' });
        declareUpload('upload-zones/photos', { name: 'photo.png', size: 1, type: 'image/png' });
        // @ts-expect-error MIME is outside the configured zone.
        declareUpload('upload-zones/cv', { name: 'file.png', size: 1, type: 'image/png' });
        // @ts-expect-error Unknown zone.
        declareUpload('upload-zones/missing', { name: 'cv.pdf', size: 1, type: 'application/pdf' });`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          types: [],
        },
        files: ['sdk.d.ts', 'generated.ts', 'usage.ts'],
      }),
    };
    await Promise.all(
      Object.entries(files).map(([name, value]) => writeFile(join(directory, name), value)),
    );
    const compiler = join(
      dirname(Bun.resolveSync('typescript/package.json', import.meta.dir)),
      'bin/tsc',
    );
    const result = Bun.spawnSync([process.execPath, compiler, '-p', directory]);
    expect(result.stdout.toString() + result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
