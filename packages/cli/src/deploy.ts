// SPDX-License-Identifier: MIT

import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { Command } from 'commander';
import { z } from 'zod';

import { CliError, exit } from './errors.ts';
import { requireDirectoryIfPresent } from './local-files.ts';

const modulesSchema = z.array(z.enum(['forms', 'uploads', 'reviews'])).nonempty();
const hex = (length = 32) => randomBytes(length).toString('hex');

type DeployOptions = {
  publicUrl: string;
  modules: string;
  image: string;
  out: string;
  scan?: boolean;
  backup?: boolean;
  tls?: boolean;
};

function garageToml(adminToken: string) {
  return `metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "lmdb"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "${hex()}"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "${adminToken}"
`;
}

async function configure(options: DeployOptions) {
  const url = URL.canParse(options.publicUrl) ? new URL(options.publicUrl) : null;
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new CliError('invalid_public_url', 'Use the public HTTPS origin without a path.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/.test(options.image))
    throw new CliError('invalid_image', 'Provide a valid image reference.');
  const modules = modulesSchema.safeParse(options.modules.split(',').map((name) => name.trim()));
  if (!modules.success) throw new CliError('invalid_modules', 'Choose forms, uploads or reviews.');
  const enabled = [...new Set(modules.data)];
  const storage = enabled.includes('uploads');
  if (options.scan && !storage)
    throw new CliError('invalid_scanner', 'Malware scanning requires uploads.');

  const profiles = [
    ...(options.tls === false ? [] : ['tls']),
    ...(storage ? ['storage'] : []),
    ...(options.scan ? ['scan'] : []),
    ...(options.backup ? ['backup'] : []),
  ];
  const env: Record<string, string> = {
    BACKBRICKS_IMAGE: options.image,
    PUBLIC_URL: url.origin,
    CADDY_HOST: url.hostname,
    BACKBRICKS_MODULES: enabled.join(','),
    COMPOSE_PROFILES: profiles.filter((profile) => profile !== 'backup').join(','),
    POSTGRES_PASSWORD: hex(),
    APP_SECRET: hex(),
  };
  const generated: Record<string, string> = {};
  if (storage) {
    env['UPLOAD_MODE'] = 'proxy';
    env['SCANNER'] = options.scan ? 'clamav' : 'none';
    env['GARAGE_ADMIN_TOKEN'] = hex();
    env['S3_ACCESS_KEY_ID'] = `GK${hex(12)}`;
    env['S3_SECRET_ACCESS_KEY'] = hex();
    generated['garage.toml'] = garageToml(env['GARAGE_ADMIN_TOKEN']);
  }
  if (options.backup) {
    env['BACKUP_NAMESPACE'] = `backbricks-${hex(8)}`;
    generated['restic-password'] = `${hex()}\n`;
  }
  if (options.tls !== false && url.port) env['HTTPS_PORT'] = url.port;
  generated['.env'] = Object.entries(env)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
  const directory = resolve(options.out);
  await requireDirectoryIfPresent(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  try {
    for (const [name, contents] of Object.entries(generated)) {
      const path = join(directory, name);
      // oxlint-disable-next-line no-await-in-loop -- Publish .env only after its companion files.
      await writeFile(path, contents, { flag: 'wx', mode: 0o600 });
      written.push(path);
    }
  } catch {
    await Promise.all(written.map((path) => unlink(path)));
    throw new CliError(
      'deploy_config_exists',
      'Choose a writable deployment directory without existing settings.',
      exit.local,
    );
  }
  return {
    directory,
    modules: enabled,
    profiles: env['COMPOSE_PROFILES'],
    backupConfigured: options.backup === true,
  };
}

export function registerDeploy(program: Command, report: (value: object) => void) {
  program
    .command('deploy')
    .description('Prepare a self-hosted deployment')
    .command('configure')
    .requiredOption('--public-url <url>', 'public HTTPS origin')
    .option('--modules <names>', 'comma-separated module names', 'forms')
    .option('--image <reference>', 'approved server image', 'backbricks/server:local')
    .option('--out <directory>', 'production Compose directory', 'deploy/compose')
    .option('--scan', 'start ClamAV for uploads')
    .option('--backup', 'generate an encryption password for the optional backup profile')
    .option('--no-tls', 'terminate TLS outside this Compose project')
    .action(async (options: DeployOptions) => report(await configure(options)));
}
