// SPDX-License-Identifier: MIT

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { link, lstat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { Command } from 'commander';

import { environment } from './environment.config.ts';
import { CliError, exit } from './errors.ts';
import catalog from './generated/admin-commands.json';
import { asRecord, optionalText, readJson } from './local-files.ts';
import { responseData } from './management.ts';
import { explicitBase, fixedFetch, sessionHeaders } from './session.ts';
import { localTarget, readSecret, resolveTarget, type TargetOptions } from './target.ts';

type CommandSpec = (typeof catalog)[number];
type AdminOptions = {
  params?: string;
  query?: string;
  data?: string;
  dataFile?: string;
  out?: string;
  session?: boolean;
  organization?: string;
  allowDestructive?: boolean;
};

const downloadOperation = 'uploads.files.download';
const fileOperations = new Set([
  'forms.submissions.export',
  'privacy.subjectExportZip',
  'createKey',
  downloadOperation,
]);
const readPosts = new Set([downloadOperation, 'privacy.subjectExport', 'privacy.subjectExportZip']);
const destructivePosts = new Set([
  'eraseProject',
  'privacy.subjectDelete',
  'invitation.cancel',
  'membership.remove',
  'forms.submissions.delete_all',
  'forms.submissions.bulk_delete',
  'uploads.files.bulk_delete',
]);

function jsonObject(input: string | undefined) {
  if (input === undefined) return {};
  const value = asRecord(readJson(input));
  if (!value) throw new CliError('invalid_input', 'Provide a JSON object.');
  return value;
}

async function checkedResponse(response: Response) {
  if (response.ok) return response;
  const error: unknown = await response.json().catch(() => null);
  return responseData<Response>({ response, error });
}

async function writePrivate(response: Response, destination: string) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    if (!response.body)
      throw new CliError('empty_response', 'The API returned an empty file.', exit.remote);
    const reader = response.body.getReader();
    const source = Readable.from(
      (async function* () {
        try {
          while (true) {
            // oxlint-disable-next-line no-await-in-loop -- Stream chunks in order without buffering the file.
            const next = await reader.read();
            if (next.done) return;
            yield next.value;
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      })(),
    );
    await pipeline(source, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    await link(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function makeUrl(
  baseUrl: string,
  spec: CommandSpec,
  params: Record<string, unknown>,
  query: Record<string, unknown>,
) {
  const path = spec.path.replaceAll(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(String(value))
    )
      throw new CliError('missing_path_parameter', `Provide a valid ${name} in --params.`);
    return encodeURIComponent(String(value));
  });
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      throw new CliError('invalid_query', 'Query values must be strings, numbers or booleans.');
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function outputPath(options: AdminOptions, spec: CommandSpec) {
  if (!options.out && fileOperations.has(spec.id))
    throw new CliError('missing_output', 'Use --out to save this private response.');
  if (!options.out) return undefined;
  const path = resolve(options.out);
  const existing = await lstat(path).catch((error: unknown) => {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
    return null;
  });
  if (existing) throw new CliError('output_exists', 'Choose a new output file.', exit.local);
  return path;
}

async function runAdmin(
  root: string,
  global: TargetOptions,
  spec: CommandSpec,
  options: AdminOptions,
  confirm: (message: string) => Promise<boolean>,
) {
  const params = jsonObject(options.params);
  const query = jsonObject(options.query);
  const explicitProject = params['projectId'] ?? global.project ?? environment().project;
  const linked =
    explicitProject === undefined && spec.path.includes('{projectId}')
      ? await localTarget(root)
      : undefined;
  const project = explicitProject ?? linked?.project;
  if (project !== undefined) params['projectId'] = project;
  if (options.organization) {
    params['organizationId'] ??= options.organization;
    if (spec.organizationSelector && spec.method === 'GET')
      query['organizationId'] ??= options.organization;
  }
  const session = options.session === true;
  if (session ? !spec.role : !spec.scope)
    throw new CliError(
      'wrong_credential',
      spec.role
        ? 'Use --session with a dashboard login.'
        : 'Use a project key with the declared scope.',
    );
  const target = session
    ? null
    : await resolveTarget(root, {
        ...global,
        project: typeof project === 'string' ? project : global.project,
      });
  const baseUrl = target?.baseUrl ?? explicitBase(global.baseUrl);
  if (target) params['projectId'] = target.project;
  const url = makeUrl(baseUrl, spec, params, query);
  const headers = new Headers(
    session
      ? await sessionHeaders(baseUrl)
      : { Authorization: `Bearer ${target && (await readSecret(target))}` },
  );
  if (session && options.organization && spec.path.startsWith('/v1/'))
    headers.set('x-backbricks-organization-id', options.organization);
  const out = await outputPath(options, spec);
  const dryRun = query['dryRun'] === true || query['dryRun'] === 'true';
  const potentiallyDestructiveConfig = /\.instance\.(update|replace|migrate|rollback)$/.test(
    spec.id,
  );
  const isWrite =
    spec.method !== 'GET' &&
    !readPosts.has(spec.id) &&
    !(spec.id === 'planProjectConfig' && dryRun);
  if (
    (spec.method === 'DELETE' ||
      destructivePosts.has(spec.id) ||
      potentiallyDestructiveConfig ||
      (spec.id === 'planProjectConfig' && !dryRun)) &&
    !options.allowDestructive
  )
    throw new CliError(
      'destructive_confirmation_required',
      'Use --allow-destructive to permit this operation.',
      exit.confirmation,
    );
  if (isWrite && !(await confirm(`Run ${spec.id} on ${baseUrl}?`)))
    throw new CliError(
      'confirmation_required',
      'Confirm the operation with --yes or an interactive prompt.',
      exit.confirmation,
    );
  let body: string | undefined;
  if (spec.method !== 'GET' && spec.method !== 'DELETE') {
    if (options.data !== undefined && options.dataFile !== undefined)
      throw new CliError('invalid_input', 'Use either --data or --data-file.');
    const data = jsonObject(
      options.dataFile ? ((await optionalText(options.dataFile, true)) ?? '') : options.data,
    );
    if (options.organization && spec.organizationSelector)
      data['organizationId'] ??= options.organization;
    if (spec.id === downloadOperation) data['preview'] = false;
    body = JSON.stringify(data);
    headers.set('content-type', 'application/json');
  }
  let response = await checkedResponse(
    await fixedFetch(url, { method: spec.method, headers, body }),
  );
  if (spec.id === downloadOperation) {
    const result = asRecord(await response.json());
    const location = typeof result?.['url'] === 'string' ? new URL(result['url']) : null;
    const loopback = location && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (
      !location ||
      location.username ||
      location.password ||
      (location.protocol !== 'https:' && !(loopback && location.protocol === 'http:'))
    )
      throw new CliError(
        'invalid_download',
        'The server returned an invalid file download URL.',
        exit.remote,
      );
    response = await checkedResponse(await fixedFetch(location));
  }
  if (out) {
    await writePrivate(response, out);
    return { saved: true };
  }
  if (!response.body) return { ok: true };
  if (!response.headers.get('content-type')?.includes('json'))
    return { text: await response.text() };
  const data: unknown = await response.json();
  return { data };
}

export function registerAdmin(
  program: Command,
  context: {
    root: string;
    options: () => TargetOptions;
    report: (value: object) => void;
    confirm: (message: string) => Promise<boolean>;
  },
) {
  const admin = program
    .command('admin')
    .description('Run authorized dashboard management operations');
  admin
    .command('list')
    .description('List operations with their required roles and scopes')
    .action(() => context.report({ operations: catalog }));
  admin
    .command('run <operation>')
    .description('Run an operation listed by admin list')
    .option('--params <json>', 'path parameter object')
    .option('--query <json>', 'query parameter object')
    .option('--data <json>', 'request body object')
    .option('--data-file <path>', 'read the request body from a private JSON file')
    .option('--out <path>', 'save a response to a new private file')
    .option('--session', 'use a dashboard user session')
    .option('--organization <id>', 'select the organization for a dashboard session')
    .option('--allow-destructive', 'permit an explicitly confirmed destructive action')
    .action(async (id: string, options: AdminOptions) => {
      const spec = catalog.find((entry) => entry.id === id);
      if (!spec)
        throw new CliError('unknown_operation', 'Use backbricks admin list to find operations.');
      context.report(
        await runAdmin(context.root, context.options(), spec, options, context.confirm),
      );
    });
}
