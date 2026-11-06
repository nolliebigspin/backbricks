import { exportOpenApi } from '../../apps/server/src/openapi.ts';
import { apiArtifacts, REPOSITORY_ROOT } from './paths.ts';

/** Generate into committed paths or an ignored comparison directory, using the same local tools. */
export async function generateApi(paths = apiArtifacts()) {
  await Bun.write(paths.contract, await exportOpenApi());
  const generated = Bun.spawn(['bun', 'tools/generate.ts', paths.contract, paths.types], {
    cwd: `${REPOSITORY_ROOT}packages/api-contract`,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await generated.exited) !== 0) throw new Error('API type generation failed.');
  const formatted = Bun.spawn(['bunx', '--no-install', 'oxfmt', paths.contract, paths.types], {
    cwd: REPOSITORY_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await formatted.exited) !== 0) throw new Error('Generated contract formatting failed.');
}
if (import.meta.main) await generateApi();
