import { canonicalJson, type ConfigChangeReport, type JsonValue } from '@backbricks/core';

import type { FormsConfig } from './config.ts';

type Report = { destructive: boolean; changedPaths: string[]; warnings: string[] };

type Kind = 'safe' | 'warning' | 'destructive';

const same = (a: unknown, b: unknown) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Parsed configs contain JSON values only.
  canonicalJson((a ?? null) as JsonValue) === canonicalJson((b ?? null) as JsonValue);
const numberOrDate = (value: unknown) =>
  typeof value === 'number' || typeof value === 'string' ? value : undefined;
/** A lower bound gets stricter when it appears or rises. */
const raised = (before: unknown, after: unknown) => {
  const [a, b] = [numberOrDate(before), numberOrDate(after)];
  return b !== undefined && (a === undefined || b > a);
};
/** An upper bound gets stricter when it appears or falls. */
const lowered = (before: unknown, after: unknown) => {
  const [a, b] = [numberOrDate(before), numberOrDate(after)];
  return b !== undefined && (a === undefined || b < a);
};

/** Option values present in a select/multiselect option list. */
const optionValues = (list: unknown) =>
  new Set(Array.isArray(list) ? list.map((option: { value?: unknown }) => option.value) : []);

/** Field-level rules; any property not listed here is destructive (err on destructive, D30). */
function classifyFieldProperty(property: string, before: unknown, after: unknown): Kind {
  switch (property) {
    case 'label':
    case 'help':
    case 'text':
    case 'version':
      return 'safe';
    case 'required':
      return after === true && before !== true ? 'warning' : 'safe';
    case 'minLength':
    case 'min':
      return raised(before, after) ? 'warning' : 'safe';
    case 'maxLength':
    case 'max':
    case 'maxFiles':
      return lowered(before, after) ? 'warning' : 'safe';
    case 'identifiesSubject':
      return 'warning';
    case 'options': {
      const next = optionValues(after);
      return [...optionValues(before)].every((value) => next.has(value)) ? 'safe' : 'destructive';
    }
    default:
      return 'destructive';
  }
}

const WARNINGS = {
  tightened: (key: string) =>
    `Field "${key}" has a stricter rule; websites sending the old values will get validation errors.`,
  requiredAdded: (key: string) =>
    `New field "${key}" is required; websites must send it or submissions fail.`,
  subject: () =>
    'The email field used for privacy requests changed; existing entries keep their stored email.',
  noSubject: () =>
    'No email field identifies the person (identifiesSubject), so entries cannot be found for privacy requests.',
  proofOfWorkOff: () =>
    'Proof-of-work is off: the form relies on the honeypot and lower rate limits and is less protected.',
  proofOfWorkOn: () =>
    'Proof-of-work is on: plain HTML forms without JavaScript can no longer submit.',
  honeypot: () => 'The honeypot field name changed; update it on your website.',
  retentionShorter: () =>
    'Entries are kept for a shorter time; existing entries get the new expiry immediately.',
  retentionUnlimited: () => 'Entries are kept without a time limit.',
};

/** `validateConfigChange` for forms (docs/modules/forms.md §2.3); paths use field keys, not indexes. */
export function classifyFormsChange(previous: FormsConfig, next: FormsConfig): ConfigChangeReport {
  const report: Report = { destructive: false, changedPaths: [], warnings: [] };
  const mark = (path: string, kind: Kind, warning?: string) => {
    report.changedPaths.push(path);
    if (kind === 'destructive') report.destructive = true;
    if (kind === 'warning' && warning) report.warnings.push(warning);
  };
  const before = new Map(previous.fields.map((entry) => [entry.key, entry]));
  const after = new Map(next.fields.map((entry) => [entry.key, entry]));
  for (const key of before.keys()) if (!after.has(key)) mark(`fields.${key}`, 'destructive');
  for (const [key, field] of after) {
    const old = before.get(key);
    if (!old) {
      mark(`fields.${key}`, field.required ? 'warning' : 'safe', WARNINGS.requiredAdded(key));
      continue;
    }
    if (old.type !== field.type) {
      mark(`fields.${key}.type`, 'destructive');
      continue;
    }
    const properties = new Set([...Object.keys(old), ...Object.keys(field)]);
    for (const property of properties) {
      const a: unknown = Reflect.get(old, property);
      const b: unknown = Reflect.get(field, property);
      if (same(a, b)) continue;
      const kind = classifyFieldProperty(property, a, b);
      mark(
        `fields.${key}.${property}`,
        kind,
        property === 'identifiesSubject' ? WARNINGS.subject() : WARNINGS.tightened(key),
      );
    }
  }
  if (
    !same(
      previous.fields.map((entry) => entry.key),
      next.fields.map((entry) => entry.key),
    )
  )
    if (!report.changedPaths.includes('fields')) report.changedPaths.push('fields');
  if (!same(previous.listFields, next.listFields)) mark('listFields', 'safe');
  if (!same(previous.limits, next.limits)) mark('limits', 'safe');
  if (!same(previous.redirects, next.redirects)) mark('redirects', 'safe');
  if (previous.spam.proofOfWork !== next.spam.proofOfWork)
    mark(
      'spam.proofOfWork',
      'warning',
      next.spam.proofOfWork ? WARNINGS.proofOfWorkOn() : WARNINGS.proofOfWorkOff(),
    );
  if (previous.spam.honeypotField !== next.spam.honeypotField)
    mark('spam.honeypotField', 'warning', WARNINGS.honeypot());
  if (previous.retentionDays !== next.retentionDays) {
    const shorter =
      next.retentionDays !== null &&
      (previous.retentionDays === null || next.retentionDays < previous.retentionDays);
    if (next.retentionDays === null)
      mark('retentionDays', 'warning', WARNINGS.retentionUnlimited());
    else mark('retentionDays', shorter ? 'warning' : 'safe', WARNINGS.retentionShorter());
  }
  const known = new Set(['fields', 'listFields', 'limits', 'redirects', 'spam', 'retentionDays']);
  for (const property of new Set([...Object.keys(previous), ...Object.keys(next)]))
    if (!known.has(property) && !same(Reflect.get(previous, property), Reflect.get(next, property)))
      mark(property, 'destructive');
  const hasEmail = next.fields.some((entry) => entry.type === 'email');
  const hasSubject = next.fields.some((entry) => entry.type === 'email' && entry.identifiesSubject);
  if (hasEmail && !hasSubject) report.warnings.push(WARNINGS.noSubject());
  return {
    destructive: report.destructive,
    changedPaths: [...new Set(report.changedPaths)].slice(0, 1000),
    warnings: [...new Set(report.warnings)].slice(0, 100),
  };
}
