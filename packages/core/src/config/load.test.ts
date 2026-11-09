import { describe, expect, test } from 'bun:test';

import * as fc from 'fast-check';

import type { AvailableModules } from '../modules/infrastructure.ts';
import { formatConfigIssues, loadConfig, parseModuleList, resolveFileVariables } from './load.ts';

// Mirrors the module declarations the server passes in (packages/modules/*).
const modules: AvailableModules = {
  uploads: [{ service: 'storage' }, { service: 'scanner', optional: true }],
  forms: [],
  reviews: [],
};

const base = {
  DATABASE_URL: 'postgres://backbricks:backbricks@localhost:5432/backbricks',
  APP_SECRET: 'x'.repeat(32),
};

const storage = {
  S3_ENDPOINT: 'http://localhost:3900',
  S3_REGION: 'garage',
  S3_BUCKET: 'backbricks',
  S3_ACCESS_KEY_ID: 'GK0001',
  S3_SECRET_ACCESS_KEY: 'secret',
};

function issuesOf(result: ReturnType<typeof loadConfig>) {
  return result.ok ? [] : result.issues;
}

describe('loadConfig', () => {
  test('storage signing endpoint defaults internally, validates safely and is ignored without storage', () => {
    const defaults = loadConfig({ ...base, ...storage }, modules);
    expect(defaults.ok && defaults.config.storage?.publicEndpoint).toBe(storage.S3_ENDPOINT);
    const split = loadConfig(
      { ...base, ...storage, S3_PUBLIC_ENDPOINT: 'https://files.example.test' },
      modules,
    );
    expect(split.ok && split.config.storage?.publicEndpoint).toBe('https://files.example.test');
    expect(
      issuesOf(
        loadConfig(
          { ...base, ...storage, S3_PUBLIC_ENDPOINT: 'http://user:secret@files.test' },
          modules,
        ),
      ),
    ).toMatchObject([{ variable: 'S3_PUBLIC_ENDPOINT' }]);
    expect(
      loadConfig({ ...base, BACKBRICKS_MODULES: 'forms', S3_PUBLIC_ENDPOINT: 'invalid' }, modules)
        .ok,
    ).toBe(true);
  });
  test('forwarded addresses require explicitly configured literal proxy addresses', () => {
    const defaults = loadConfig({ ...base, BACKBRICKS_MODULES: 'forms' }, modules);
    if (!defaults.ok) throw new Error(formatConfigIssues(defaults.issues));
    expect(defaults.config.trustedProxies).toEqual([]);
    const configured = loadConfig(
      { ...base, BACKBRICKS_MODULES: 'forms', TRUSTED_PROXIES: '127.0.0.1, ::1' },
      modules,
    );
    if (!configured.ok) throw new Error(formatConfigIssues(configured.issues));
    expect(configured.config.trustedProxies).toEqual(['127.0.0.1', '::1']);
    for (const invalid of ['proxy.local', '0.0.0.0/0', '*']) {
      expect(
        issuesOf(
          loadConfig({ ...base, BACKBRICKS_MODULES: 'forms', TRUSTED_PROXIES: invalid }, modules),
        ),
      ).toMatchObject([{ variable: 'TRUSTED_PROXIES' }]);
    }
  });
  test('applies defaults and enables every module when BACKBRICKS_MODULES is unset', () => {
    const result = loadConfig({ ...base, ...storage }, modules);
    if (!result.ok) throw new Error(formatConfigIssues(result.issues));
    expect(result.config).toMatchObject({
      nodeEnv: 'production',
      deploymentMode: 'self_hosted',
      modules: ['uploads', 'forms', 'reviews'],
      publicUrl: 'http://localhost:3000',
      port: 3000,
      logLevel: 'info',
      mailer: null,
      scanner: { kind: 'none' },
    });
    expect(result.config.storage?.bucket).toBe('backbricks');
  });

  test('forms only needs no storage or scanner variables (ADR-0019)', () => {
    const result = loadConfig({ ...base, BACKBRICKS_MODULES: 'forms' }, modules);
    if (!result.ok) throw new Error(formatConfigIssues(result.issues));
    expect(result.config.modules).toEqual(['forms']);
    expect(result.config.storage).toBeNull();
    expect(result.config.scanner).toBeNull();
  });

  test('uploads requires the storage variables', () => {
    const issues = issuesOf(loadConfig({ ...base, BACKBRICKS_MODULES: 'uploads' }, modules));
    expect(issues.map((issue) => issue.variable).toSorted()).toEqual([
      'S3_ACCESS_KEY_ID',
      'S3_BUCKET',
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_SECRET_ACCESS_KEY',
    ]);
  });

  test('SCANNER=clamav requires a host and defaults the port', () => {
    const missingHost = issuesOf(loadConfig({ ...base, ...storage, SCANNER: 'clamav' }, modules));
    expect(missingHost.map((issue) => issue.variable)).toEqual(['CLAMAV_HOST']);

    const result = loadConfig(
      { ...base, ...storage, SCANNER: 'clamav', CLAMAV_HOST: 'clamav' },
      modules,
    );
    expect(result.ok && result.config.scanner).toEqual({
      kind: 'clamav',
      host: 'clamav',
      port: 3310,
    });
  });

  test('rejects an unknown scanner', () => {
    const issues = issuesOf(loadConfig({ ...base, ...storage, SCANNER: 'virustotal' }, modules));
    expect(issues).toEqual([{ variable: 'SCANNER', message: 'must be none or clamav' }]);
  });

  test('collects every problem at once', () => {
    const issues = issuesOf(loadConfig({ PORT: 'eighty', LOG_LEVEL: 'loud' }, modules));
    expect(issues.map((issue) => issue.variable)).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'APP_SECRET', 'PORT', 'LOG_LEVEL', 'S3_ENDPOINT']),
    );
  });

  test('SMTP_URL needs MAIL_FROM; both together configure the mailer', () => {
    const smtp = { BACKBRICKS_MODULES: 'forms', SMTP_URL: 'smtp://mailpit:1025' };
    expect(issuesOf(loadConfig({ ...base, ...smtp }, modules))).toEqual([
      { variable: 'MAIL_FROM', message: 'is required when SMTP_URL is set' },
    ]);
    const result = loadConfig({ ...base, ...smtp, MAIL_FROM: 'noreply@example.com' }, modules);
    expect(result.ok && result.config.mailer).toEqual({
      smtpUrl: 'smtp://mailpit:1025',
      from: 'noreply@example.com',
    });
  });

  test('error output never contains the values (I4)', () => {
    const secrets = {
      DATABASE_URL: 'mysql://admin:hunter2-database@db/app',
      APP_SECRET: 'short-hunter2-secret',
      SMTP_URL: 'http://user:hunter2-smtp@mail',
      S3_ENDPOINT: 'ftp://hunter2-endpoint',
    };
    const result = loadConfig(secrets, modules);
    expect(result.ok).toBe(false);
    const output = formatConfigIssues(issuesOf(result));
    expect(output).toContain('DATABASE_URL');
    expect(output).not.toContain('hunter2');
  });
});

describe('resolveFileVariables (Docker secrets)', () => {
  const files: Record<string, string> = { '/run/secrets/app': 'from-file-secret\n' };
  const readFile = (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error('ENOENT');
    return content;
  };

  test('reads <NAME>_FILE and drops the trailing newline', () => {
    const { env, issues } = resolveFileVariables({ APP_SECRET_FILE: '/run/secrets/app' }, readFile);
    expect(issues).toEqual([]);
    expect(env['APP_SECRET']).toBe('from-file-secret');
  });

  test('setting both <NAME> and <NAME>_FILE is an error', () => {
    const { issues } = resolveFileVariables(
      { APP_SECRET: 'direct', APP_SECRET_FILE: '/run/secrets/app' },
      readFile,
    );
    expect(issues).toEqual([
      { variable: 'APP_SECRET', message: 'set either APP_SECRET or APP_SECRET_FILE, not both' },
    ]);
  });

  test('an unreadable file is reported by its variable', () => {
    const { issues } = resolveFileVariables({ DATABASE_URL_FILE: '/missing' }, readFile);
    expect(issues).toEqual([
      { variable: 'DATABASE_URL_FILE', message: 'cannot read the file /missing' },
    ]);
  });

  test('empty values count as unset', () => {
    expect(resolveFileVariables({ PORT: '' }, readFile).env['PORT']).toBeUndefined();
  });
});

describe('parseModuleList', () => {
  const available = ['uploads', 'forms', 'reviews'];

  test('unset or empty enables every module', () => {
    expect(parseModuleList(undefined, available)).toEqual({ modules: available });
    expect(parseModuleList(' , ', available)).toEqual({ modules: available });
  });

  test('names unknown modules and lists the available ones', () => {
    expect(parseModuleList('forms,chat', available)).toEqual({
      issue: {
        variable: 'BACKBRICKS_MODULES',
        message: 'unknown module "chat"; available: uploads, forms, reviews',
      },
    });
  });

  test('any spelling of a subset yields that subset in installation order', () => {
    const spelling = fc.tuple(
      fc.constantFrom(...available),
      fc.boolean(),
      fc.constantFrom('', ' ', '  '),
    );
    fc.assert(
      fc.property(fc.array(spelling, { minLength: 1 }), (parts) => {
        const value = parts
          .map(([name, upper, pad]) => `${pad}${upper ? name.toUpperCase() : name}${pad}`)
          .join(',');
        const chosen = new Set(parts.map(([name]) => name));
        expect(parseModuleList(value, available)).toEqual({
          modules: available.filter((name) => chosen.has(name)),
        });
      }),
    );
  });
});
