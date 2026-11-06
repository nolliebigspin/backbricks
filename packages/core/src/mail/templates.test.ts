import { describe, expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { escapeHtml, renderAuthMail } from './templates.ts';

describe('safe auth mail templates', () => {
  test('escapes all markup and attribute delimiters for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(escapeHtml(input)).not.toMatch(/[<>"']/);
      }),
    );
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  test('renders hostile organization names as text in both languages', () => {
    for (const locale of ['en', 'de'] as const) {
      const mail = renderAuthMail('https://backbricks.example', {
        kind: 'invitation',
        locale,
        to: 'invitee@example.invalid',
        url: '/accept-invitation?invitationId=example&source=team',
        organizationName: '<img src=x onerror="alert(1)">',
      });
      expect(mail.html).not.toContain('<img');
      expect(mail.html).toContain('&lt;img');
      expect(mail.html).toContain('&amp;source=team');
      expect(mail.subject).not.toContain('alert');
      expect(mail.text).toContain('<img');
    }
  });

  test('rejects foreign, credential-bearing and unsupported action URLs', () => {
    for (const url of [
      'https://evil.invalid/accept-invitation',
      '//evil.invalid/accept-invitation',
      'javascript:alert(1)',
      'https://user:password@backbricks.example/accept-invitation',
      '/unrelated',
      '/accept-invitation#fragment',
    ]) {
      expect(() =>
        renderAuthMail('https://backbricks.example', {
          kind: 'invitation',
          to: 'invitee@example.invalid',
          url,
        }),
      ).toThrow('Internal server error');
    }
    expect(() =>
      renderAuthMail('https://backbricks.example', {
        kind: 'reset_password',
        to: 'invitee@example.invalid',
        url: '/api/auth/reset-password/token?callbackURL=https%3A%2F%2Fevil.invalid',
      }),
    ).toThrow('Internal server error');
  });

  test('supports the pinned Better Auth verification and reset URL formats', () => {
    const verification = renderAuthMail('https://backbricks.example', {
      kind: 'verify_email',
      to: 'owner@example.invalid',
      url: '/api/auth/verify-email?token=verification',
    });
    const reset = renderAuthMail('https://backbricks.example', {
      kind: 'reset_password',
      to: 'owner@example.invalid',
      url: '/api/auth/reset-password/reset-token?callbackURL=%2Freset-password',
    });
    expect(verification.subject).toContain('Confirm');
    expect(reset.subject).toContain('Reset');
  });
});
