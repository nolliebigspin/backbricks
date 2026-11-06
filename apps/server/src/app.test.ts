import { describe, expect, test } from 'bun:test';

import { AppError, createIds, systemClock } from '@backbricks/core';
import { createDatabase } from '@backbricks/db';

import { createApp } from './app.ts';
import type { ReadinessCheck } from './context.ts';
import { createLogger } from './logger.ts';

function setup(readinessChecks: ReadinessCheck[] = []) {
  const lines: string[] = [];
  const log = createLogger('debug', { write: (line) => lines.push(line) });
  const app = createApp({ log, ids: createIds(systemClock), readinessChecks, dashboardDir: null });
  const logs = () => lines.map((line) => asRecord(JSON.parse(line)));
  return { app, logs, rawLogs: () => lines.join('') };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('expected a JSON object');
  return Object.fromEntries(Object.entries(value));
}

async function problem(response: Response) {
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  return asRecord(await response.json());
}

describe('server app', () => {
  test('GET /healthz answers ok with a generated request ID', async () => {
    const { app } = setup();
    const response = await app.request('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-request-id')).toMatch(/^req_[0-9a-z]{26}$/);
  });

  test('keeps a well-formed incoming request ID and replaces a malformed one', async () => {
    const { app } = setup();
    const kept = await app.request('/healthz', { headers: { 'X-Request-Id': 'proxy-123.a_b' } });
    expect(kept.headers.get('x-request-id')).toBe('proxy-123.a_b');
    const replaced = await app.request('/healthz', { headers: { 'X-Request-Id': 'a b<script>' } });
    expect(replaced.headers.get('x-request-id')).toMatch(/^req_/);
  });

  test('unknown routes return a not_found problem with the request ID', async () => {
    const { app } = setup();
    const response = await app.request('/v1/nope');
    expect(response.status).toBe(404);
    expect(await problem(response)).toEqual({
      type: 'https://backbricks.app/errors/not_found',
      title: 'Not found',
      status: 404,
      code: 'not_found',
      detail: 'No route for GET /v1/nope.',
      requestId: response.headers.get('x-request-id'),
    });
  });

  test('an AppError becomes its problem', async () => {
    const { app } = setup();
    app.get('/invalid', () => {
      throw new AppError('validation_failed', { detail: '1 field is invalid.' });
    });
    const response = await app.request('/invalid');
    expect(response.status).toBe(422);
    expect(await problem(response)).toMatchObject({
      code: 'validation_failed',
      detail: '1 field is invalid.',
    });
  });

  test('unexpected errors become a generic 500 and are logged in full', async () => {
    const { app, logs } = setup();
    app.get('/boom', () => {
      throw new Error('internal detail that must not leak');
    });
    const response = await app.request('/boom');
    expect(response.status).toBe(500);
    const body = await problem(response);
    expect(body).toMatchObject({ code: 'internal_error', title: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('internal detail');
    const errorLog = logs().find((line) => line['msg'] === 'unhandled error');
    expect(JSON.stringify(errorLog)).toContain('internal detail that must not leak');
  });

  test('bodies over the default limit are rejected with payload_too_large', async () => {
    const { app } = setup();
    const response = await app.request('/healthz', {
      method: 'POST',
      body: 'x'.repeat(1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(await problem(response)).toMatchObject({ code: 'payload_too_large' });
  });

  test('the access log records the path without the query string or headers (I4)', async () => {
    const { app, rawLogs, logs } = setup();
    await app.request('/healthz?key=bb_pk_publishable_in_query', {
      headers: { Authorization: 'Bearer bb_sk_secret_header' },
    });
    const access = logs().find((line) => line['msg'] === 'request');
    expect(access).toMatchObject({ method: 'GET', path: '/healthz', status: 200 });
    expect(typeof access?.['requestId']).toBe('string');
    expect(rawLogs()).not.toContain('bb_pk_publishable_in_query');
    expect(rawLogs()).not.toContain('bb_sk_secret_header');
  });

  test('the logger redacts secret fields in anything it logs (I4)', () => {
    const lines: string[] = [];
    const log = createLogger('info', { write: (line) => lines.push(line) });
    log.info(
      { headers: { authorization: 'Bearer bb_sk_x' }, config: { appSecret: 's3cr3t' } },
      'x',
    );
    expect(lines.join('')).not.toContain('bb_sk_x');
    expect(lines.join('')).not.toContain('s3cr3t');
    expect(lines.join('')).toContain('[redacted]');
  });
});

describe('GET /readyz', () => {
  test('200 when every check passes', async () => {
    const { app } = setup([{ name: 'database', check: async () => {} }]);
    const response = await app.request('/readyz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  test('503 names the failing check without leaking its error', async () => {
    const { app, logs } = setup([
      {
        name: 'database',
        check: async () => {
          throw new Error('password authentication failed for user "backbricks"');
        },
      },
    ]);
    const response = await app.request('/readyz');
    expect(response.status).toBe(503);
    const body = await problem(response);
    expect(body).toMatchObject({ code: 'service_unavailable', detail: 'Not ready: database.' });
    expect(JSON.stringify(body)).not.toContain('password');
    expect(logs().some((line) => line['msg'] === 'readiness check failed')).toBe(true);
  });

  test('against Postgres: 200 when reachable, 503 when not', async () => {
    const up = createDatabase(
      process.env['TEST_DATABASE_URL'] ??
        'postgres://backbricks:backbricks@localhost:5432/backbricks',
    );
    const down = createDatabase('postgres://backbricks:backbricks@127.0.0.1:1/backbricks');
    try {
      const reachable = await up.ping().then(
        () => true,
        () => false,
      );
      if (!reachable && !process.env['CI']) return; // needs `mise run infra` locally
      expect(
        (await setup([{ name: 'database', check: up.ping }]).app.request('/readyz')).status,
      ).toBe(200);
      expect(
        (await setup([{ name: 'database', check: down.ping }]).app.request('/readyz')).status,
      ).toBe(503);
    } finally {
      await up.close();
      await down.close();
    }
  });
});
