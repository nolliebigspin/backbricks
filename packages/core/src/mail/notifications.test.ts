import { describe, expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { mailMessageSchema } from './contract.ts';
import {
  NOTIFICATION_CONTENT_LIMIT,
  NOTIFICATION_VALUE_LIMIT,
  renderNotificationMail,
} from './notifications.ts';

const base = 'https://backbricks.example';
const entry = {
  kind: 'entry' as const,
  to: 'member@example.invalid',
  locale: 'en' as const,
  sourceName: 'Contact',
  at: new Date('2026-11-09T08:15:30Z'),
  path: '/projects/prj_1/forms/contact?entry=sub_1',
  fields: [],
};

describe('notification mail', () => {
  test('is content-free by default and links only into the dashboard', () => {
    for (const locale of ['en', 'de'] as const) {
      const mail = renderNotificationMail(base, { ...entry, locale });
      expect(mail.subject).toContain('Contact');
      expect(mail.text).toContain('2026-11-09 08:15 UTC');
      expect(mail.text).toContain(`${base}/projects/prj_1/forms/contact?entry=sub_1`);
      expect(mail.html).not.toContain('<dl>');
    }
    expect(renderNotificationMail(base, entry).text).toContain('does not include the entry');
    expect(() =>
      renderNotificationMail(base, { ...entry, path: 'https://evil.example/projects/x' }),
    ).toThrow();
    expect(() => renderNotificationMail(base, { ...entry, path: '/activity' })).toThrow();
  });

  test('escapes opt-in content and hostile names as text', () => {
    const mail = renderNotificationMail(base, {
      ...entry,
      sourceName: 'Contact\r\nBcc: x@example.invalid <b>',
      fields: [{ label: '<i>Message</i>', value: '<script>alert(1)</script>' }],
    });
    expect(mailMessageSchema.safeParse(mail).success).toBe(true);
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('&lt;i&gt;Message&lt;/i&gt;');
    expect(mail.text).toContain('<script>alert(1)</script>');
  });

  test('caps content so any entry fits the mail body limit', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            label: fc.string({ maxLength: 200 }),
            value: fc.string({ maxLength: 3000 }),
          }),
          { maxLength: 50 },
        ),
        (fields) => {
          const mail = renderNotificationMail(base, { ...entry, fields });
          expect(mailMessageSchema.safeParse(mail).success).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
    const worst = renderNotificationMail(base, {
      ...entry,
      fields: Array.from({ length: 50 }, () => ({
        label: '"'.repeat(200),
        value: '"'.repeat(3000),
      })),
    });
    expect(mailMessageSchema.safeParse(worst).success).toBe(true);
    const long = renderNotificationMail(base, {
      ...entry,
      fields: [{ label: 'Message', value: 'x'.repeat(NOTIFICATION_VALUE_LIMIT + 10) }],
    });
    expect(long.text).toContain(`${'x'.repeat(NOTIFICATION_VALUE_LIMIT)}…`);
    expect(long.text).toContain('Some content was shortened.');
    expect(NOTIFICATION_CONTENT_LIMIT).toBeGreaterThan(NOTIFICATION_VALUE_LIMIT);
  });

  test('digests carry only a count, in both languages', () => {
    const digest = { ...entry, kind: 'digest' as const, count: 3, path: '/projects/prj_1' };
    const en = renderNotificationMail(base, digest);
    expect(en.subject).toBe('3 more entries: Contact');
    expect(renderNotificationMail(base, { ...digest, count: 1 }).subject).toBe(
      '1 more entry: Contact',
    );
    const de = renderNotificationMail(base, { ...digest, locale: 'de' });
    expect(de.subject).toBe('3 weitere Einträge: Contact');
    expect(de.text).toContain('sind 3 weitere Einträge');
  });
});
