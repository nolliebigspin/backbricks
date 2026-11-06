import { pathToFileURL } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';

const input = process.argv[2]
  ? pathToFileURL(process.argv[2])
  : new URL('../openapi.json', import.meta.url);
const output = process.argv[3] ?? new URL('../src/generated.ts', import.meta.url);
const ast = await openapiTS(input);
await Bun.write(
  output,
  `/** Generated from openapi.json. Run bun run api:generate; do not edit. */\n${astToString(ast)}`,
);
