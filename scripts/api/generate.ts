import { canonicalJson, configurationJsonSchema, jsonValueSchema } from '@backbricks/core';

import { moduleCatalog } from '../../apps/server/src/modules.ts';
import { exportOpenApi } from '../../apps/server/src/openapi.ts';
import { adminCommands } from './admin-commands.ts';
import { apiArtifacts, REPOSITORY_ROOT } from './paths.ts';

/** Generate into committed paths or an ignored comparison directory, using the same local tools. */
export async function generateApi(paths = apiArtifacts()) {
  const contract = await exportOpenApi();
  await Bun.write(paths.contract, contract);
  await Bun.write(paths.adminCommands, canonicalJson(adminCommands(JSON.parse(contract))));
  const generated = Bun.spawn(
    ['bun', 'tools/generate.ts', paths.contract, paths.types, paths.adminCommands],
    {
      cwd: `${REPOSITORY_ROOT}packages/api-contract`,
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  if ((await generated.exited) !== 0) throw new Error('API type generation failed.');
  const modules = moduleCatalog.select(Object.keys(moduleCatalog.available));
  const schema = jsonValueSchema.parse(configurationJsonSchema(modules.registry));
  await Bun.write(paths.configSchema, canonicalJson(schema));
  const formatted = Bun.spawn(
    ['bunx', '--no-install', 'oxfmt', paths.contract, paths.types, paths.adminCommands],
    {
      cwd: REPOSITORY_ROOT,
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  if ((await formatted.exited) !== 0) throw new Error('Generated contract formatting failed.');
  const formattedSchema = Bun.spawn(['bunx', '--no-install', 'oxfmt', paths.configSchema], {
    cwd: REPOSITORY_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await formattedSchema.exited) !== 0) throw new Error('Config schema formatting failed.');
}
if (import.meta.main) await generateApi();
