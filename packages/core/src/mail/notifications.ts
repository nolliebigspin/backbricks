import { AppError } from '../errors/app-error.ts';
import type { NotificationSubject } from '../notifications/schemas.ts';
import type { MailMessage } from './contract.ts';
import { escapeHtml } from './templates.ts';

/** Opt-in content is capped per value and in total so a large entry can't fill an inbox (I8). */
export const NOTIFICATION_VALUE_LIMIT = 1000;
export const NOTIFICATION_CONTENT_LIMIT = 8000;
const NAME_LIMIT = 120;

export type NotificationLocale = 'en' | 'de';
export type NotificationMailInput =
  | {
      kind: 'entry';
      to: string;
      locale: NotificationLocale;
      /** The instance (e.g. form) the entry belongs to. */
      sourceName: string;
      at: Date;
      /** Dashboard path, resolved against the installation's public URL. */
      path: string;
      fields: NotificationSubject['fields'];
    }
  | {
      kind: 'digest';
      to: string;
      locale: NotificationLocale;
      sourceName: string;
      at: Date;
      path: string;
      count: number;
    };

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const copy = {
  en: {
    entrySubject: (name: string) => `New entry: ${name}`,
    entryIntro: (name: string, time: string) => `A new entry arrived in “${name}” on ${time}.`,
    private: 'For privacy, this email does not include the entry.',
    shortened: 'Some content was shortened.',
    openEntry: 'Open entry',
    digestSubject: (name: string, count: number) =>
      `${count} more ${plural(count, 'entry', 'entries')}: ${name}`,
    digestIntro: (name: string, count: number, time: string) =>
      `${count} more ${plural(count, 'entry', 'entries')} arrived in “${name}” after the hourly email limit was reached (since ${time}).`,
    openInbox: 'Open inbox',
  },
  de: {
    entrySubject: (name: string) => `Neuer Eintrag: ${name}`,
    entryIntro: (name: string, time: string) =>
      `Am ${time} ist ein neuer Eintrag in „${name}“ eingegangen.`,
    private: 'Aus Datenschutzgründen enthält diese E-Mail den Eintrag nicht.',
    shortened: 'Einige Inhalte wurden gekürzt.',
    openEntry: 'Eintrag öffnen',
    digestSubject: (name: string, count: number) =>
      `${count} ${plural(count, 'weiterer Eintrag', 'weitere Einträge')}: ${name}`,
    digestIntro: (name: string, count: number, time: string) =>
      `Nach Erreichen des stündlichen E-Mail-Limits ${plural(count, 'ist', 'sind')} ${count} ${plural(count, 'weiterer Eintrag', 'weitere Einträge')} in „${name}“ eingegangen (seit ${time}).`,
    openInbox: 'Posteingang öffnen',
  },
} as const;

function cleanName(value: string) {
  // oxlint-disable-next-line no-control-regex -- Names are user text; header-breaking characters must go.
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return text.length > NAME_LIMIT ? `${text.slice(0, NAME_LIMIT - 1)}…` : text || '–';
}
const formatTime = (at: Date) => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function dashboardLink(publicUrl: string, path: string) {
  const base = new URL(publicUrl);
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith('/projects/'))
    throw new AppError('internal_error');
  return url.href;
}

/** Truncates opt-in values to the per-value and total budgets, keeping field order. */
function capped(fields: NotificationSubject['fields']) {
  let budget = NOTIFICATION_CONTENT_LIMIT;
  let shortened = false;
  const kept: { label: string; value: string }[] = [];
  for (const field of fields) {
    if (budget <= 0) {
      shortened = true;
      break;
    }
    const label = cleanName(field.label);
    // Labels count too: the escaped HTML must stay within MAIL_BODY_LIMIT.
    const limit = Math.max(0, Math.min(NOTIFICATION_VALUE_LIMIT, budget - label.length));
    const value = field.value.length > limit ? `${field.value.slice(0, limit)}…` : field.value;
    shortened ||= value !== field.value;
    budget -= label.length + value.length;
    kept.push({ label, value });
  }
  return { fields: kept, shortened };
}

/**
 * Notification mail for one member. Content-free unless the rule opted in; every user-provided
 * string is escaped in HTML (I8) and the only link points into this installation's dashboard.
 */
export function renderNotificationMail(
  publicUrl: string,
  input: NotificationMailInput,
): MailMessage {
  const text = copy[input.locale];
  const name = cleanName(input.sourceName);
  const time = formatTime(input.at);
  const url = dashboardLink(publicUrl, input.path);
  if (input.kind === 'digest') {
    const intro = text.digestIntro(name, input.count, time);
    return {
      to: input.to,
      subject: text.digestSubject(name, input.count),
      text: [intro, url].join('\n\n'),
      html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(text.openInbox)}</a></p>`,
    };
  }
  const intro = text.entryIntro(name, time);
  const content = capped(input.fields);
  const notes = [
    ...(content.fields.length === 0 ? [text.private] : []),
    ...(content.shortened ? [text.shortened] : []),
  ];
  return {
    to: input.to,
    subject: text.entrySubject(name),
    text: [
      intro,
      ...content.fields.map((field) => `${field.label}:\n${field.value}`),
      ...notes,
      url,
    ].join('\n\n'),
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      content.fields.length
        ? `<dl>${content.fields
            .map(
              (field) =>
                `<dt><strong>${escapeHtml(field.label)}</strong></dt><dd style="white-space:pre-wrap">${escapeHtml(field.value)}</dd>`,
            )
            .join('')}</dl>`
        : '',
      ...notes.map((note) => `<p>${escapeHtml(note)}</p>`),
      `<p><a href="${escapeHtml(url)}">${escapeHtml(text.openEntry)}</a></p>`,
    ].join(''),
  };
}
