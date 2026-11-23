import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { CliError } from './errors.ts';
import { atomicText, optionalText, requireDirectoryIfPresent } from './local-files.ts';
import { projectTypes } from './management.ts';
import type { Target } from './target.ts';

export async function codegen(root: string, target: Target, out: string) {
  const file = resolve(root, out);
  const path = relative(root, file);
  if (
    !path ||
    path === '..' ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path) ||
    !path.endsWith('.ts')
  )
    throw new CliError('unsafe_output_path', 'Choose a TypeScript output file inside the site.');
  const folders = dirname(path).split(sep);
  let directory = root;
  for (const folder of folders) {
    directory = resolve(directory, folder);
    // oxlint-disable-next-line no-await-in-loop -- Check each path component before following it.
    await requireDirectoryIfPresent(directory);
  }
  const types = await projectTypes(target);
  if (typeof types !== 'string')
    throw new CliError('invalid_codegen_response', 'The server did not return TypeScript.');
  const current = await optionalText(file);
  const changed = types !== current;
  if (changed) await atomicText(file, types, { current });
  return { path, changed };
}
