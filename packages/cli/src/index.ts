#!/usr/bin/env node
import { cwd, argv, stdin, stdout, stderr } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import { Command, CommanderError, Option } from 'commander';

import { codegen } from './codegen.ts';
import { plan, pull, push, readConfig } from './configuration.ts';
import { doctor } from './doctor.ts';
import { CliError, exit, redact } from './errors.ts';
import { integrationGuide } from './integration-guide.ts';
import { asRecord, readJson } from './local-files.ts';
import { integration, listKeys, testSubmit } from './management.ts';
import { frameworks, initialize, type Framework } from './project-files.ts';
import {
  assertCredentialTarget,
  isSecret,
  readSecret,
  resolveTarget,
  saveSecret,
  type TargetOptions,
} from './target.ts';
import { validInstanceKey } from './validation.ts';

type GlobalOptions = TargetOptions & { json?: boolean; yes?: boolean };

async function prompt(message: string, hidden = false) {
  const output = hidden
    ? new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    : stderr;
  const reader = createInterface({ input: stdin, output, terminal: hidden || stdin.isTTY });
  if (hidden) stderr.write(message);
  try {
    return await reader.question(hidden ? '' : message);
  } finally {
    reader.close();
    if (hidden) stderr.write('\n');
  }
}

function print(value: object, json: boolean, output: Writable = stdout) {
  const text = JSON.stringify(value, undefined, json ? undefined : 2);
  output.write(`${redact(text)}\n`);
}

async function main(args: string[]) {
  const root = cwd();
  const program = new Command()
    .name('backbricks')
    .description('Manage a Backbricks integration.')
    .option('--base-url <url>', 'Backbricks deployment URL')
    .option('--project <id>', 'project ID')
    .option('--json', 'output machine-readable JSON')
    .option('--yes', 'confirm without prompting')
    .showHelpAfterError()
    .exitOverride();
  program.configureOutput({
    writeErr: (text: string) => {
      if (!args.includes('--json')) stderr.write(redact(text));
    },
  });

  const options = () => program.opts<GlobalOptions>();
  const target = () => resolveTarget(root, options());
  const report = (value: object) => print(value, options().json ?? false);
  async function confirm(message: string) {
    if (options().yes) return true;
    if (options().json || !stdin.isTTY) return false;
    const answer = await prompt(`${message} [y/N] `);
    return /^y(?:es)?$/i.test(answer.trim());
  }

  program
    .command('login')
    .description('Verify and store a scoped secret key for this project')
    .option('--key <secret>', 'secret key, preferably supplied via BACKBRICKS_SECRET_KEY')
    .action(async ({ key }: { key?: string }) => {
      const selected = await target();
      const credential =
        key ??
        (await readSecret(selected, false)) ??
        (stdin.isTTY && !options().json && !options().yes
          ? (await prompt('Secret key: ', true)).trim()
          : undefined);
      if (!isSecret(credential))
        throw new CliError('missing_credentials', 'Provide a Backbricks secret key.');
      await assertCredentialTarget(selected, credential);
      await integration(selected, credential);
      await saveSecret(selected, credential);
      report({ project: selected.project, stored: true });
    });

  program
    .command('init')
    .description('Link this site and write public integration settings')
    .addOption(new Option('--framework <name>', 'site framework').choices(frameworks))
    .option('--agents', 'add an integration section to AGENTS.md')
    .action(async (input: { framework?: Framework; agents?: boolean }) =>
      report(await initialize(root, await target(), input)),
    );

  program
    .command('validate')
    .description('Validate the local config file offline')
    .action(async () => {
      const { document } = await readConfig(root);
      report({ valid: true, project: document.project });
    });

  program
    .command('pull')
    .description('Save the remote config to the local file')
    .action(async () => report(await pull(root, await target(), confirm)));

  program
    .command('diff')
    .description('Plan local config changes without applying them')
    .action(async () => report(await plan(await target(), (await readConfig(root)).document)));

  program
    .command('push')
    .description('Plan and apply the local config')
    .option('--allow-destructive', 'permit an explicitly confirmed destructive plan')
    .action(async ({ allowDestructive }: { allowDestructive?: boolean }) =>
      report(
        await push(root, await target(), allowDestructive ?? false, confirm, (planDetails) =>
          print(planDetails, false, stderr),
        ),
      ),
    );

  program
    .command('codegen')
    .description('Generate TypeScript types for the project')
    .option('--out <file>', 'output TypeScript file', 'src/backbricks.gen.ts')
    .action(async ({ out }: { out: string }) => report(await codegen(root, await target(), out)));

  program
    .command('doctor')
    .description('Check project connectivity, origins and public credential exposure')
    .option('--origin <url>', 'verify the exact origin used by the website')
    .action(async ({ origin }: { origin?: string }) => report(await doctor(root, target, origin)));

  program
    .command('docs')
    .description('Print the offline integration guide')
    .option('--agent', 'print the agent guide')
    .addOption(new Option('--framework <name>', 'site framework').choices(frameworks))
    .action(({ framework }: { framework?: Framework }) => {
      const markdown = integrationGuide(framework);
      if (options().json) report({ markdown });
      else stdout.write(markdown);
    });

  program
    .command('keys')
    .description('Read project key metadata')
    .command('list')
    .option('--cursor <token>', 'list the next page')
    .action(async ({ cursor }: { cursor?: string }) =>
      report(await listKeys(await target(), cursor)),
    );

  program
    .command('test')
    .description('Create a flagged project test entry')
    .command('submit <resource>')
    .requiredOption('--data <json>', 'synthetic form data as JSON')
    .action(async (resource: string, { data }: { data: string }) => {
      const key = /^forms\/([^/]+)$/.exec(resource)?.[1];
      const fields = asRecord(readJson(data));
      if (!key || !validInstanceKey(key) || !fields)
        throw new CliError('invalid_test_input', 'Provide forms/<key> and a JSON object.');
      report(await testSubmit(await target(), key, fields));
    });

  program
    .command('mcp')
    .description('Start the stdio MCP server')
    .action(async () => {
      const { startMcp } = await import('./mcp.ts');
      await startMcp(await target());
    });

  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    if (error instanceof CommanderError && !options().json && !args.includes('--json'))
      return exit.usage;
    const failure =
      error instanceof CliError
        ? error
        : error instanceof CommanderError
          ? new CliError('invalid_command', 'Invalid command or options. See backbricks --help.')
          : new CliError(
              'operation_failed',
              'The operation could not complete. Check your local files and connection.',
              exit.local,
            );
    if (!args.includes('mcp') && (options().json || args.includes('--json')))
      print({ code: failure.code, message: failure.message, ...failure.details }, true);
    else {
      stderr.write(`${redact(failure.message)}\n`);
      if (failure.details) print(failure.details, false, stderr);
    }
    return failure.exitCode;
  }
  return 0;
}

process.exitCode = await main(argv.slice(2));
