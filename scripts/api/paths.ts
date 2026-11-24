import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CONTRACT_PATH = 'packages/api-contract/openapi.json';
export const TYPES_PATH = 'packages/api-contract/src/generated.ts';
export const CONFIG_SCHEMA_PATH = 'packages/cli/src/generated/config-schema.json';
export const ADMIN_COMMANDS_PATH = 'packages/cli/src/generated/admin-commands.json';
export const apiArtifacts = () => ({
  contract: resolve(REPOSITORY_ROOT, CONTRACT_PATH),
  types: resolve(REPOSITORY_ROOT, TYPES_PATH),
  configSchema: resolve(REPOSITORY_ROOT, CONFIG_SCHEMA_PATH),
  adminCommands: resolve(REPOSITORY_ROOT, ADMIN_COMMANDS_PATH),
});
