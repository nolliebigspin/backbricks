import { expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

import { authSchema } from '@backbricks/db';

import { receivedMail } from '../../../scripts/test/mailpit.ts';
import {
  scenario,
  cookies,
  actionLink,
  available,
  AUTH_TEST_SECRET,
} from '../test/auth-fixture.ts';

test.skipIf(!available)(
  'auth rejects cross-origin, CSRF, raw plugin bypass, oversized input and excess attempts',
  async () => {
    await scenario(async ({ request, db }) => {
      const body = { email: 'nobody@example.invalid', password: 'long-password-1234' };
      expect(
        (await request('/sign-in/email', body, undefined, { origin: 'https://foreign.invalid' }))
          .status,
      ).toBe(403);
      expect(
        (await request('/sign-in/email', body, undefined, { 'x-backbricks-csrf': 'wrong' })).status,
      ).toBe(403);
      expect(
        (await request('/organization/create', { name: 'Bypass', slug: 'bypass' })).status,
      ).toBe(404);
      expect((await request('/sign-up/email', { ...body, name: 'x'.repeat(65_536) })).status).toBe(
        413,
      );
      const attempts = await Promise.all(
        Array.from({ length: 25 }, () => request('/sign-in/email', body)),
      );
      const blocked = attempts.find((response) => response.status === 429);
      expect(blocked).toBeDefined();
      expect(Number(blocked?.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(await db.select().from(authSchema.user)).toHaveLength(0);
    });
  },
  15_000,
);

test.skipIf(!available)(
  'invite-only signup cannot be bypassed; no SMTP never reveals verification/reset links',
  async () => {
    await scenario(
      async ({ request, db }) => {
        expect(
          (
            await request('/sign-up/email', {
              name: 'Fixture',
              email: 'fixture@example.invalid',
              password: 'long-password-1234',
            })
          ).status,
        ).toBe(403);
        await Promise.all(
          ['/request-password-reset', '/send-verification-email'].map(async (path) => {
            const response = await request(path, { email: 'fixture@example.invalid' });
            expect(response.status).toBe(503);
            expect(await response.json()).not.toHaveProperty('token');
          }),
        );
        expect(await db.select().from(authSchema.user)).toHaveLength(0);
      },
      { SIGNUP_POLICY: 'invite_only', SMTP_URL: '', MAIL_FROM: '' },
    );
  },
);

test.skipIf(!available)(
  'production cookies are secure and expired sessions lose access',
  async () => {
    await scenario(
      async ({ request, db }) => {
        const email = `secure-${crypto.randomUUID()}@example.invalid`;
        const credentials = { email, password: 'long-password-1234' };
        expect((await request('/sign-up/email', { ...credentials, name: 'Fixture' })).status).toBe(
          200,
        );
        const link = actionLink((await receivedMail(email)).HTML);
        expect((await request(`/verify-email${link.search}`)).status).toBe(302);
        const signin = await request('/sign-in/email', credentials);
        expect(signin.status).toBe(200);
        const header = signin.headers.getSetCookie().join('\n');
        expect(header).toContain('Secure');
        expect(header).toContain('HttpOnly');
        expect(header).toContain('SameSite=Lax');
        await db.update(authSchema.session).set({ expiresAt: new Date('2000-01-01T00:00:00Z') });
        expect(await (await request('/get-session', undefined, cookies(signin))).json()).toBeNull();
      },
      { NODE_ENV: 'production', PUBLIC_URL: 'https://backbricks.example.invalid' },
    );
  },
  15_000,
);

test.skipIf(!available)(
  'failed email verification rolls back replay claims and rejects foreign callbacks',
  async () => {
    await scenario(async ({ request, db }) => {
      const email = `rollback-${crypto.randomUUID()}@example.invalid`;
      await request('/sign-up/email', { email, name: 'Fixture', password: 'long-password-1234' });
      const link = actionLink((await receivedMail(email)).HTML);
      await db.execute(
        'ALTER TABLE "user" ADD CONSTRAINT fixture_verification_failure CHECK (NOT email_verified)',
      );
      expect((await request(`/verify-email${link.search}`)).status).toBe(503);
      expect((await db.select().from(authSchema.user))[0]?.emailVerified).toBe(false);
      await db.execute('ALTER TABLE "user" DROP CONSTRAINT fixture_verification_failure');
      const claims = await db.execute('SELECT digest FROM auth_token_replays');
      if (Array.isArray(claims)) throw new Error('Expected one statement result');
      expect(claims.rows).toHaveLength(0);
      const payload = [
        Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
        Buffer.from(JSON.stringify({ email, exp: 1 })).toString('base64url'),
      ].join('.');
      const expired = `${payload}.${createHmac('sha256', AUTH_TEST_SECRET).update(payload).digest('base64url')}`;
      expect((await request(`/verify-email?token=${expired}`)).status).toBe(401);
      const foreign = new URL(link);
      foreign.searchParams.set('callbackURL', 'https://foreign.invalid/');
      expect((await request(`/verify-email${foreign.search}`)).status).toBe(403);
      expect((await request(`/verify-email${link.search}`)).status).toBe(302);
      expect((await request('/verify-email?token=invalid-token')).status).toBe(401);
    });
  },
  15_000,
);

test.skipIf(!available)(
  'commit failure rolls back signup and sends no verification mail',
  async () => {
    await scenario(async ({ request, db, logs }) => {
      await db.execute(`CREATE FUNCTION fixture_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private-commit-diagnostic'; END $$`);
      await db.execute(`CREATE CONSTRAINT TRIGGER fixture_commit_failure AFTER INSERT ON "user"
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixture_commit_failure()`);
      const email = `commit-failure-${crypto.randomUUID()}@example.invalid`;
      const response = await request('/sign-up/email', {
        email,
        name: 'Fixture',
        password: 'long-password-1234',
      });
      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toHaveLength(0);
      expect(await db.select().from(authSchema.user)).toHaveLength(0);
      const mail = await receivedMail(email).catch((error: unknown) => error);
      expect(mail).toBeInstanceOf(Error);
      expect(logs.join('')).toContain('auth.request_failed');
      expect(logs.join('')).not.toContain('private-commit-diagnostic');
      expect(logs.join('')).not.toContain(email);
    });
  },
  15_000,
);
