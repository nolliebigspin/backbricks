import { fileURLToPath } from 'node:url';

import { exportOpenApi } from '../../apps/server/src/openapi.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const contract = fileURLToPath(
  new URL('../../packages/api-contract/openapi.json', import.meta.url),
);
const types = fileURLToPath(
  new URL('../../packages/api-contract/src/generated.ts', import.meta.url),
);
await Bun.write(contract, await exportOpenApi());
const generated = Bun.spawn(['bun', 'tools/generate.ts'], {
  cwd: `${root}packages/api-contract`,
  stdout: 'inherit',
  stderr: 'inherit',
});
if ((await generated.exited) !== 0) throw new Error('API type generation failed.');
const formatted = Bun.spawn(['bunx', '--no-install', 'oxfmt', contract, types], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
});
if ((await formatted.exited) !== 0) throw new Error('Generated contract formatting failed.');
