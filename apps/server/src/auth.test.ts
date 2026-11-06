import { expect, test } from 'bun:test';

import { authSchema } from '@backbricks/db';

import { receivedMail } from '../../../scripts/test/mailpit.ts';
import { scenario, cookies, actionLink, available } from '../test/auth-fixture.ts';

test.skipIf(!available)(
  'dashboard auth verifies before login, uses private sessions and revokes logout',
  async () => {
    await scenario(async ({ request, db, logs }) => {
      const email = `auth-${crypto.randomUUID()}@example.invalid`;
      const credentials = { email, password: 'a-long-test-password-1234' };
      expect((await request('/get-session')).status).toBe(200);
      const signup = await request('/sign-up/email', {
        ...credentials,
        name: '<script>fixture</script>',
      });
      expect(signup.status).toBe(200);
      expect(signup.headers.getSetCookie()).toHaveLength(0);
      expect((await request('/sign-in/email', credentials)).status).toBe(403);
      const verification = actionLink((await receivedMail(email)).HTML);
      const attempts = await Promise.all(
        [1, 2].map(() =>
          request(
            `${verification.pathname.slice('/api/auth'.length)}${verification.search}`,
            undefined,
            undefined,
            { 'sec-fetch-site': 'cross-site' },
          ),
        ),
      );
      expect(attempts.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
        302, 401,
      ]);
      expect(
        (await request(`${verification.pathname.slice('/api/auth'.length)}${verification.search}`))
          .status,
      ).toBe(401);
      const signin = await request('/sign-in/email', credentials, undefined, {
        'user-agent': 'private-full-user-agent',
      });
      expect(signin.status).toBe(200);
      const setCookie = signin.headers.getSetCookie().join('\n');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).not.toContain('Secure'); // explicit HTTP test/development exception
      expect(await signin.json()).not.toHaveProperty('token');
      const cookie = cookies(signin);
      expect(await (await request('/get-session', undefined, cookie)).json()).toHaveProperty(
        'user',
      );
      const sessions = await db.select().from(authSchema.session);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.ipAddress).toMatch(/^[a-f0-9]{64}$/);
      expect(sessions[0]?.userAgent).toBeNull();
      expect((await request('/sign-out', {}, cookie)).status).toBe(200);
      expect(await (await request('/get-session', undefined, cookie)).json()).toBeNull();
      expect(logs.join('')).not.toContain(email);
      expect(logs.join('')).not.toContain('private-full-user-agent');
      expect(logs.join('')).not.toContain('127.0.0.1');
      expect(logs.join('')).not.toContain(verification.searchParams.get('token')!);
    });
  },
  15_000,
);

test.skipIf(!available)(
  'password reset is generic, expires, is single-use and invalidates sessions',
  async () => {
    await scenario(async ({ request, db }) => {
      const email = `reset-${crypto.randomUUID()}@example.invalid`;
      const credentials = { email, password: 'a-long-test-password-1234' };
      await request('/sign-up/email', { ...credentials, name: 'Fixture' });
      const verification = actionLink((await receivedMail(email)).HTML);
      await request(`${verification.pathname.slice('/api/auth'.length)}${verification.search}`);
      const signin = await request('/sign-in/email', credentials);
      const cookie = cookies(signin);
      const unknown = await request('/request-password-reset', {
        email: 'absent@example.invalid',
        redirectTo: '/reset-password',
      });
      const known = await request('/request-password-reset', {
        email,
        redirectTo: '/reset-password',
      });
      expect(known.status).toBe(200);
      expect(await known.json()).toEqual(await unknown.json());
      const mail = await receivedMail(email, 0, 'Reset');
      expect(mail.Subject).toContain('Reset');
      const link = actionLink(mail.HTML);
      const token = link.pathname.split('/').at(-1)!;
      const callback = await request(`${link.pathname.slice('/api/auth'.length)}${link.search}`);
      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toContain('/reset-password?token=');
      const records = await db.select().from(authSchema.verification);
      expect(JSON.stringify(records)).not.toContain(token);
      const body = { token, newPassword: 'a-new-long-password-5678' };
      expect((await request('/reset-password', body)).status).toBe(200);
      expect((await request('/reset-password', body)).status).toBe(400);
      expect(await (await request('/get-session', undefined, cookie)).json()).toBeNull();
      expect((await request('/sign-in/email', credentials)).status).toBe(401);
      expect((await request('/sign-in/email', { email, password: body.newPassword })).status).toBe(
        200,
      );
      await request('/request-password-reset', { email });
      await db.update(authSchema.verification).set({ expiresAt: new Date('2000-01-01T00:00:00Z') });
      const latest = actionLink((await receivedMail(email)).HTML)
        .pathname.split('/')
        .at(-1)!;
      expect((await request('/reset-password', { ...body, token: latest })).status).toBe(400);
    });
  },
  15_000,
);
