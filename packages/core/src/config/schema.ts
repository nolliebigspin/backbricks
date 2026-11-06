/**
 * Environment variables, validated with Zod (AGENTS.md §2.2). The base part is always
 * required; the storage and scanner parts only when an enabled module declares them
 * (ADR-0019). `.env.example` documents every variable.
 */
import { z } from 'zod';

import { canonicalIp } from '../privacy/ip-identity.ts';

const postgresUrl = z
  .string({ error: 'is required' })
  .refine((value) => /^postgres(ql)?:\/\/.+/.test(value), 'must be a postgres:// URL');

const httpUrl = z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' });

export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'], {
      error: 'must be development, test or production',
    })
    .default('production'),
  DEPLOYMENT_MODE: z
    .enum(['self_hosted', 'cloud'], { error: 'must be self_hosted or cloud' })
    .default('self_hosted'),
  DATABASE_URL: postgresUrl,
  APP_SECRET: z
    .string({ error: 'is required' })
    .min(32, 'must be at least 32 characters (e.g. `openssl rand -hex 32`)'),
  PUBLIC_URL: httpUrl.default('http://localhost:3000'),
  TRUSTED_PROXIES: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean),
    )
    .pipe(
      z.array(
        z
          .string()
          .refine(
            (address) => canonicalIp(address) !== null,
            'must contain only literal proxy IP addresses (no CIDR ranges or hostnames)',
          ),
      ),
    ),
  PORT: z.coerce
    .number({ error: 'must be a port number' })
    .int('must be a port number')
    .min(1, 'must be a port number')
    .max(65_535, 'must be a port number')
    .default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
      error: 'must be fatal, error, warn, info, debug, trace or silent',
    })
    .default('info'),
  // Optional: without SMTP, invitations fall back to copyable links (ARCHITECTURE §A.5).
  SMTP_URL: z
    .string()
    .refine((value) => /^smtps?:\/\/.+/.test(value), 'must be an smtp:// or smtps:// URL')
    .optional(),
  MAIL_FROM: z.email('must be an email address').optional(),
});

export const storageEnvSchema = z.object({
  S3_ENDPOINT: httpUrl,
  S3_REGION: z.string({ error: 'is required' }).min(1, 'is required'),
  S3_BUCKET: z.string({ error: 'is required' }).min(1, 'is required'),
  S3_ACCESS_KEY_ID: z.string({ error: 'is required' }).min(1, 'is required'),
  S3_SECRET_ACCESS_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
  S3_FORCE_PATH_STYLE: z.stringbool({ error: 'must be true or false' }).default(false),
});

export const scannerEnvSchema = z.discriminatedUnion(
  'SCANNER',
  [
    z.object({ SCANNER: z.literal('none') }),
    z.object({
      SCANNER: z.literal('clamav'),
      CLAMAV_HOST: z.string({ error: 'is required when SCANNER=clamav' }).min(1),
      CLAMAV_PORT: z.coerce
        .number({ error: 'must be a port number' })
        .int('must be a port number')
        .min(1, 'must be a port number')
        .max(65_535, 'must be a port number')
        .default(3310),
    }),
  ],
  { error: 'must be none or clamav' },
);

/** Every variable the config reads; each can also be given as `<NAME>_FILE` (Docker secrets). */
export const CONFIG_VARIABLES: readonly string[] = [
  'BACKBRICKS_MODULES',
  ...Object.keys(baseEnvSchema.shape),
  ...Object.keys(storageEnvSchema.shape),
  'SCANNER',
  'CLAMAV_HOST',
  'CLAMAV_PORT',
];
