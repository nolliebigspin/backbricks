import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

export function environment() {
  return {
    baseUrl: env['BACKBRICKS_BASE_URL'],
    project: env['BACKBRICKS_PROJECT_ID'],
    secret: env['BACKBRICKS_SECRET_KEY'],
    directory:
      env['BACKBRICKS_CONFIG_HOME'] ??
      join(env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'backbricks'),
    variables: env,
  };
}
