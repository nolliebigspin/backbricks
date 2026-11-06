import { describe, expect, test } from 'bun:test';

import { renderAuthMail, toProblemDetails, AppError } from '@backbricks/core';

import { mailpitAvailable, receivedMail, TEST_SMTP_URL } from '../../../../scripts/test/mailpit.ts';
import { createSmtpMailer } from './smtp.ts';

const available = await mailpitAvailable();

describe.skipIf(!available)('SMTP adapter (Mailpit)', () => {
  test('delivers escaped HTML/text without external resources or recipient disclosure', async () => {
    const recipient = `smtp-${crypto.randomUUID()}@example.invalid`;
    const mailer = createSmtpMailer({ smtpUrl: TEST_SMTP_URL, from: 'noreply@example.invalid' });
    try {
      await mailer.send(
        renderAuthMail('http://localhost:3000', {
          kind: 'invitation',
          to: recipient,
          url: '/accept-invitation?invitationId=test',
          organizationName: '<script>alert("test")</script>',
        }),
      );
      const received = await receivedMail(recipient);
      expect(received.To.map((address) => address.Address)).toEqual([recipient]);
      expect(received.HTML).not.toContain('<script>');
      expect(received.HTML).toContain('&lt;script&gt;');
      expect(received.Text).toContain('http://localhost:3000/accept-invitation?invitationId=test');
    } finally {
      await mailer.close();
    }
  });
});

test('missing SMTP and URL debug options fail without echoing configuration secrets', () => {
  expect(() => createSmtpMailer({ smtpUrl: '', from: 'noreply@example.invalid' })).toThrow(
    'SMTP_URL is invalid.',
  );
  const secret = 'private-smtp-password';
  try {
    createSmtpMailer({
      smtpUrl: `smtp://user:${secret}@127.0.0.1:1025?debug=true`,
      from: 'noreply@example.invalid',
    });
    throw new Error('Expected invalid SMTP configuration');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(JSON.stringify(error)).not.toContain(secret);
  }
});

test('SMTP failure exposes only a safe retryable error', async () => {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  const mailer = createSmtpMailer({
    smtpUrl: `smtp://127.0.0.1:${port}`,
    from: 'noreply@example.invalid',
  });
  try {
    const failure = await mailer
      .send(
        renderAuthMail('http://localhost:3000', {
          kind: 'reset_password',
          to: 'private-recipient@example.invalid',
          url: '/api/auth/reset-password/private-token',
        }),
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    if (!(failure instanceof AppError)) throw new Error('Expected a safe provider error');
    expect(failure.code).toBe('service_unavailable');
    const body = JSON.stringify(toProblemDetails(failure, 'req_mail'));
    expect(body).not.toContain('private-recipient');
    expect(body).not.toContain('private-token');
  } finally {
    await mailer.close();
  }
});
