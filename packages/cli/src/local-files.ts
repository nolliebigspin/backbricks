import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { platform } from 'node:process';

import { CliError, exit } from './errors.ts';

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

function missing(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function requireDirectoryIfPresent(path: string) {
  try {
    if (!(await lstat(path)).isDirectory())
      throw new CliError('unsafe_local_file', 'Expected a real local directory.', exit.local);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}

export async function optionalText(path: string, privateFile = false): Promise<string | undefined> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > MAX_CONFIG_BYTES)
      throw new CliError(
        'unsafe_local_file',
        'Expected a regular, bounded local file.',
        exit.local,
      );
    if (privateFile && platform !== 'win32' && (info.mode & 0o077) !== 0)
      throw new CliError(
        'unsafe_credentials',
        'Set the credential file permissions to 0600.',
        exit.local,
      );
    return await readFile(path, 'utf8');
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

export async function atomicText(
  path: string,
  text: string,
  condition?: { current: string | undefined },
) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    try {
      await file.writeFile(text, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    if (!condition) {
      await rename(temporary, path);
      return;
    }
    const lockPath = `${path}.backbricks-lock`;
    const lock = await open(lockPath, 'wx', 0o600);
    try {
      if ((await optionalText(path)) !== condition.current)
        throw new CliError(
          'local_file_changed',
          'A local file changed while the command ran.',
          exit.local,
        );
      await rename(temporary, path);
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!missing(error)) throw error;
    });
  }
}

export function readJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError('invalid_json', 'The local file contains invalid JSON.');
  }
}

export const jsonText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
