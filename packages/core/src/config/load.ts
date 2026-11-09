import { readFileSync } from 'node:fs';

import type { z } from 'zod';

import {
  type AvailableModules,
  type InfraService,
  requiredInfrastructure,
} from '../modules/infrastructure.ts';
import {
  baseEnvSchema,
  CONFIG_VARIABLES,
  scannerEnvSchema,
  storageEnvSchema,
  type signupPolicySchema,
} from './schema.ts';

export type Env = Readonly<Record<string, string | undefined>>;

/** A problem with one variable. Never contains the variable's value (I4). */
export type ConfigIssue = { variable: string; message: string };

export type StorageConfig = {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type ScannerConfig = { kind: 'none' } | { kind: 'clamav'; host: string; port: number };

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  deploymentMode: 'self_hosted' | 'cloud';
  /** Enabled module types, in the order the installation lists its modules. */
  modules: string[];
  databaseUrl: string;
  appSecret: string;
  publicUrl: string;
  signupPolicy: z.infer<typeof signupPolicySchema>;
  trustedProxies: readonly string[];
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  mailer: { smtpUrl: string; from: string } | null;
  /** Present only when an enabled module needs object storage. */
  storage: StorageConfig | null;
  /** Present only when an enabled module declares a scanner. */
  scanner: ScannerConfig | null;
};

export type ConfigResult = { ok: true; config: Config } | { ok: false; issues: ConfigIssue[] };

export type ReadFile = (path: string) => string;

const readUtf8: ReadFile = (path) => readFileSync(path, 'utf8');

/**
 * Applies `<NAME>_FILE` variables: the file content (without the trailing newline) becomes the
 * value of `<NAME>`. Setting both `<NAME>` and `<NAME>_FILE` is an error.
 */
export function resolveFileVariables(
  env: Env,
  readFile: ReadFile = readUtf8,
): { env: Record<string, string | undefined>; issues: ConfigIssue[] } {
  const resolved: Record<string, string | undefined> = {};
  const issues: ConfigIssue[] = [];
  for (const name of CONFIG_VARIABLES) {
    const direct = env[name];
    const file = env[`${name}_FILE`];
    if (file === undefined || file === '') {
      resolved[name] = direct === '' ? undefined : direct;
      continue;
    }
    if (direct !== undefined && direct !== '') {
      issues.push({ variable: name, message: `set either ${name} or ${name}_FILE, not both` });
      continue;
    }
    try {
      resolved[name] = readFile(file).replace(/\r?\n$/, '');
    } catch {
      issues.push({ variable: `${name}_FILE`, message: `cannot read the file ${file}` });
    }
  }
  return { env: resolved, issues };
}

/**
 * Parses `BACKBRICKS_MODULES` (comma-separated, case-insensitive). Unset or empty means every
 * available module (ARCHITECTURE §C.7).
 */
export function parseModuleList(
  value: string | undefined,
  available: readonly string[],
): { modules: string[] } | { issue: ConfigIssue } {
  const requested = [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (requested.length === 0) return { modules: [...available] };
  const unknown = requested.filter((name) => !available.includes(name));
  if (unknown.length > 0) {
    return {
      issue: {
        variable: 'BACKBRICKS_MODULES',
        message: `unknown module ${unknown.map((name) => `"${name}"`).join(', ')}; available: ${available.join(', ')}`,
      },
    };
  }
  // Keep the installation's order so registries and navigation stay stable.
  return { modules: available.filter((name) => requested.includes(name)) };
}

function zodIssues(error: z.ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({
    variable: String(issue.path[0] ?? 'environment'),
    message: issue.message,
  }));
}

function parsePart<T>(schema: z.ZodType<T>, env: Env, issues: ConfigIssue[]): T | null {
  const result = schema.safeParse(env);
  if (result.success) return result.data;
  issues.push(...zodIssues(result.error));
  return null;
}

/**
 * Validates the environment for the given installation. Collects every problem instead of
 * stopping at the first, so operators can fix their `.env` in one go.
 */
export function loadConfig(env: Env, modules: AvailableModules, readFile?: ReadFile): ConfigResult {
  const { env: resolved, issues } = resolveFileVariables(env, readFile);

  const moduleList = parseModuleList(resolved['BACKBRICKS_MODULES'], Object.keys(modules));
  const enabled = 'modules' in moduleList ? moduleList.modules : [];
  if ('issue' in moduleList) issues.push(moduleList.issue);
  const infra: Map<InfraService, { optional: boolean }> = requiredInfrastructure(modules, enabled);

  const base = parsePart(baseEnvSchema, resolved, issues);
  if (base?.SMTP_URL !== undefined && base.MAIL_FROM === undefined) {
    issues.push({ variable: 'MAIL_FROM', message: 'is required when SMTP_URL is set' });
  }

  const storage = infra.has('storage') ? parsePart(storageEnvSchema, resolved, issues) : null;

  const scannerNeed = infra.get('scanner');
  const scanner = scannerNeed
    ? parsePart(
        scannerEnvSchema,
        {
          ...resolved,
          SCANNER: resolved['SCANNER'] ?? (scannerNeed.optional ? 'none' : undefined),
        },
        issues,
      )
    : null;

  if (issues.length > 0 || base === null) return { ok: false, issues };

  return {
    ok: true,
    config: {
      nodeEnv: base.NODE_ENV,
      deploymentMode: base.DEPLOYMENT_MODE,
      modules: enabled,
      databaseUrl: base.DATABASE_URL,
      appSecret: base.APP_SECRET,
      publicUrl: base.PUBLIC_URL,
      signupPolicy: base.SIGNUP_POLICY,
      trustedProxies: base.TRUSTED_PROXIES,
      port: base.PORT,
      logLevel: base.LOG_LEVEL,
      mailer:
        base.SMTP_URL !== undefined && base.MAIL_FROM !== undefined
          ? { smtpUrl: base.SMTP_URL, from: base.MAIL_FROM }
          : null,
      storage: storage && {
        endpoint: storage.S3_ENDPOINT,
        publicEndpoint: storage.S3_PUBLIC_ENDPOINT ?? storage.S3_ENDPOINT,
        region: storage.S3_REGION,
        bucket: storage.S3_BUCKET,
        accessKeyId: storage.S3_ACCESS_KEY_ID,
        secretAccessKey: storage.S3_SECRET_ACCESS_KEY,
        forcePathStyle: storage.S3_FORCE_PATH_STYLE,
      },
      scanner:
        scanner === null
          ? null
          : scanner.SCANNER === 'none'
            ? { kind: 'none' }
            : { kind: 'clamav', host: scanner.CLAMAV_HOST, port: scanner.CLAMAV_PORT },
    },
  };
}

/** Human-readable list of config problems, one per line, without any values. */
export function formatConfigIssues(issues: readonly ConfigIssue[]): string {
  const lines = issues.map(({ variable, message }) => `  - ${variable}: ${message}`);
  return [
    'Invalid configuration. Fix these environment variables (see .env.example):',
    ...lines,
  ].join('\n');
}

/** Reads `process.env`; the only place in the codebase that does (DEV-5). */
export function loadConfigFromProcessEnv(modules: AvailableModules): ConfigResult {
  return loadConfig(process.env, modules);
}
