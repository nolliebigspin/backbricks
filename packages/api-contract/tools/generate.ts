import openapiTS, { astToString } from 'openapi-typescript';

const ast = await openapiTS(new URL('../openapi.json', import.meta.url));
await Bun.write(
  new URL('../src/generated.ts', import.meta.url),
  `/** Generated from openapi.json. Run bun run api:generate; do not edit. */\n${astToString(ast)}`,
);
