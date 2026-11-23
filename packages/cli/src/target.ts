import { createHash } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { environment } from './environment.config.ts';
import { CliError } from './errors.ts';
import {
  asRecord,
  atomicText,
  jsonText,
  optionalText,
  readJson,
  requireDirectoryIfPresent,
} from './local-files.ts';

export const CONFIG_FILE = 'backbricks.config.json';
export const TARGET_FILE = '.backbricks/target.json';

export type Target = { baseUrl: string; project: string; explicitBase: boolean };
export type TargetOptions = { baseUrl?: string; project?: string };

export function apiBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('invalid_base_url', 'Provide a valid Backbricks API URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new CliError(
      'invalid_base_url',
      'Use an HTTPS API URL, or HTTP on the local loopback interface.',
    );
  return url.href.replace(/\/$/, '').replace(/\/v1$/, '');
}

export async function localTarget(root: string) {
  const value = asRecord(readJson(await optionalText(join(root, TARGET_FILE))));
  return typeof value?.['baseUrl'] === 'string' && typeof value['project'] === 'string'
    ? { baseUrl: apiBaseUrl(value['baseUrl']), project: value['project'] }
    : undefined;
}

export async function resolveTarget(root: string, options: TargetOptions): Promise<Target> {
  const env = environment();
  const explicit = options.baseUrl ?? env.baseUrl;
  const preferredProject = options.project ?? env.project;
  const link = explicit && preferredProject ? undefined : await localTarget(root);
  const config =
    preferredProject || link
      ? undefined
      : asRecord(readJson(await optionalText(join(root, CONFIG_FILE))));
  const project = preferredProject ?? link?.project ?? config?.['project'];
  const baseUrl = explicit ?? link?.baseUrl;
  if (!baseUrl || typeof project !== 'string' || !/^prj_[0-9a-z]{26}$/.test(project))
    throw new CliError(
      'missing_target',
      'Provide --base-url and --project, or run from a linked site.',
    );
  return { baseUrl: apiBaseUrl(baseUrl), project, explicitBase: explicit !== undefined };
}

function credentialLocation(target: Target) {
  const path = join(environment().directory, 'credentials');
  return { path, key: JSON.stringify([target.baseUrl, target.project]) };
}

export function isSecret(value: unknown): value is string {
  return typeof value === 'string' && /^bb_sk_[a-zA-Z0-9]+$/.test(value);
}

const fingerprint = (secret: string) => createHash('sha256').update(secret).digest('hex');

async function savedTarget(target: Target) {
  const { path, key } = credentialLocation(target);
  await requireDirectoryIfPresent(dirname(path));
  return asRecord(asRecord(readJson(await optionalText(path, true)))?.[key]);
}

export async function assertCredentialTarget(target: Target, credential: string) {
  if (target.explicitBase) return;
  const stored = await savedTarget(target);
  if (stored?.['fingerprint'] !== fingerprint(credential))
    throw new CliError(
      'untrusted_credential_target',
      'Confirm the API URL with --base-url before first using this key.',
    );
}

export async function readSecret(target: Target, required = true) {
  const override = environment().secret;
  if (isSecret(override)) {
    await assertCredentialTarget(target, override);
    return override;
  }
  const stored = override ?? (await savedTarget(target))?.['secret'];
  if (isSecret(stored)) return stored;
  if (required || stored !== undefined)
    throw new CliError(
      'missing_credentials',
      'Set BACKBRICKS_SECRET_KEY or run backbricks login for this project.',
    );
  return undefined;
}

async function updateCredentials(target: Target, secret: string, store: boolean) {
  const { path, key } = credentialLocation(target);
  const directory = environment().directory;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await requireDirectoryIfPresent(directory);
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const values = asRecord(readJson(await optionalText(path, true)));
    const previous = asRecord(values?.[key]);
    await atomicText(
      path,
      jsonText({
        ...values,
        [key]: { ...previous, fingerprint: fingerprint(secret), ...(store ? { secret } : {}) },
      }),
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export const saveSecret = (target: Target, secret: string) =>
  updateCredentials(target, secret, true);

export async function trustEnvironmentCredential(target: Target) {
  const secret = environment().secret;
  if (target.explicitBase && isSecret(secret)) await updateCredentials(target, secret, false);
}
