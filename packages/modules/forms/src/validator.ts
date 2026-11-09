import {
  AppError,
  emailAddressSchema,
  type FieldError,
  type FieldErrorCode,
  type JsonValue,
} from '@backbricks/core';
import { z } from 'zod';

import type { FormField, FormsConfig } from './config.ts';

/** `json`: typed JSON values. `form`: urlencoded strings, repeated names as arrays (P2.4b). */
export type SubmissionTransport = 'json' | 'form';
export type NormalizedSubmission = Readonly<{
  /** Normalized answers keyed by field key; absent answers are omitted. */
  data: Readonly<Record<string, JsonValue>>;
  /** Normalized value of the `identifiesSubject` email field, for privacy requests. */
  subjectEmail: string | null;
}>;

type Issue = { code: FieldErrorCode; message: string; meta?: Record<string, JsonValue> };
type Result = { value: JsonValue | undefined } | { issue: Issue };
const ABSENT: Result = { value: undefined };
const issue = (code: FieldErrorCode, message: string, meta?: Issue['meta']): Result => ({
  issue: { code, message, ...(meta ? { meta } : {}) },
});

const TRUE_STRINGS = new Set(['on', 'true', '1', 'yes']);
const FALSE_STRINGS = new Set(['off', 'false', '0', 'no']);
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const PHONE = /^[0-9 +\-()/]{5,32}$/;
const FILE_REF = /^[A-Za-z0-9_]{1,128}$/;
const dateSchema = z.iso.date();
// Length limits count code points, like PostgreSQL's char_length, not UTF-16 units or graphemes.
// oxlint-disable-next-line typescript/no-misused-spread -- Code points are the intended unit.
const characters = (value: string) => [...value].length;

/** Strings are trimmed, line endings unified and empty answers collapse to absent. */
function text(raw: unknown): string | undefined | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  return value === '' ? undefined : value;
}

function lengthRule(value: string, field: { minLength?: number; maxLength: number }): Result {
  const size = characters(value);
  if (field.minLength !== undefined && size < field.minLength)
    return issue('too_short', `Must be at least ${field.minLength} characters.`, {
      min: field.minLength,
    });
  if (size > field.maxLength)
    return issue('too_long', `Must be at most ${field.maxLength} characters.`, {
      max: field.maxLength,
    });
  return { value };
}

function stringField(raw: unknown, check: (value: string) => Result): Result {
  const value = text(raw);
  if (value === null) return issue('invalid_type', 'Must be text.');
  return value === undefined ? ABSENT : check(value);
}

function list(raw: unknown, transport: SubmissionTransport): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  return transport === 'form' && typeof raw === 'string' ? [raw] : null;
}

function bool(raw: unknown, transport: SubmissionTransport): boolean | undefined | null {
  if (typeof raw === 'boolean') return raw;
  if (transport !== 'form' || typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;
  if (TRUE_STRINGS.has(value)) return true;
  return FALSE_STRINGS.has(value) ? false : null;
}

function fieldValue(
  field: FormField,
  raw: unknown,
  transport: SubmissionTransport,
  now: Date,
): Result {
  if (raw === null || raw === undefined) return ABSENT;
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'hidden':
      return stringField(raw, (value) => lengthRule(value, field));
    case 'email':
      return stringField(raw, (value) => {
        const email = value.toLowerCase();
        return emailAddressSchema.safeParse(email).success
          ? { value: email }
          : issue('invalid_email', 'Must be a valid email address.');
      });
    case 'phone':
      return stringField(raw, (value) =>
        PHONE.test(value) && (value.match(/\d/g)?.length ?? 0) >= 3
          ? { value }
          : issue('invalid_phone', 'Must be a valid phone number.'),
      );
    case 'url':
      return stringField(raw, (value) => {
        if (!URL.canParse(value)) return issue('invalid_url', 'Must be a valid http(s) URL.');
        const url = new URL(value);
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password)
          return issue('invalid_url', 'Must be a valid http(s) URL.');
        return lengthRule(value, field);
      });
    case 'date':
      return stringField(raw, (value) => {
        if (!dateSchema.safeParse(value).success)
          return issue('invalid_date', 'Must be a date (YYYY-MM-DD).');
        if (field.min !== undefined && value < field.min)
          return issue('too_small', `Must be on or after ${field.min}.`, { min: field.min });
        if (field.max !== undefined && value > field.max)
          return issue('too_large', `Must be on or before ${field.max}.`, { max: field.max });
        return { value };
      });
    case 'number': {
      let value: number | undefined;
      if (typeof raw === 'number') value = raw;
      else if (transport === 'form' && typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed === '') return ABSENT;
        value = NUMBER.test(trimmed) ? Number(trimmed) : Number.NaN;
      } else return issue('invalid_type', 'Must be a number.');
      if (!Number.isFinite(value)) return issue('invalid_type', 'Must be a number.');
      if (field.min !== undefined && value < field.min)
        return issue('too_small', `Must be at least ${field.min}.`, { min: field.min });
      if (field.max !== undefined && value > field.max)
        return issue('too_large', `Must be at most ${field.max}.`, { max: field.max });
      // -0 and 0 are the same answer; keep JSON output canonical.
      return { value: value === 0 ? 0 : value };
    }
    case 'checkbox': {
      const value = bool(raw, transport);
      if (value === null) return issue('invalid_type', 'Must be true or false.');
      // A required checkbox must be checked; an unchecked one is a missing answer.
      return value === false && field.required ? ABSENT : { value };
    }
    case 'consent': {
      const value = bool(raw, transport);
      if (value === null) return issue('invalid_type', 'Must be true.');
      if (value !== true) return issue('must_accept', 'Must be accepted.');
      return { value: { accepted: true, version: field.version, acceptedAt: now.toISOString() } };
    }
    case 'select':
      return stringField(raw, (value) =>
        field.options.some((option) => option.value === value)
          ? { value }
          : issue('invalid_option', 'Must be one of the listed options.'),
      );
    case 'multiselect': {
      const items = list(raw, transport);
      if (!items || items.some((item) => typeof item !== 'string'))
        return issue('invalid_type', 'Must be a list of options.');
      const chosen = new Set(
        items.flatMap((item) => {
          const value = text(item);
          return typeof value === 'string' ? [value] : [];
        }),
      );
      if ([...chosen].some((value) => !field.options.some((option) => option.value === value)))
        return issue('invalid_option', 'Must contain only the listed options.');
      if (chosen.size === 0) return ABSENT;
      if (field.min !== undefined && chosen.size < field.min)
        return issue('too_few_options', `Choose at least ${field.min}.`, { min: field.min });
      if (field.max !== undefined && chosen.size > field.max)
        return issue('too_many_options', `Choose at most ${field.max}.`, { max: field.max });
      // Option order, not submission order, so equal answers are stored equally.
      return {
        value: field.options.flatMap((option) => (chosen.has(option.value) ? [option.value] : [])),
      };
    }
    case 'file': {
      const items = list(raw, transport);
      if (!items || items.some((item) => typeof item !== 'string'))
        return issue('invalid_type', 'Must be a list of file references.');
      const refs = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
      if (refs.some((ref) => !FILE_REF.test(ref)))
        return issue('invalid_file', 'Must be file references from an upload.');
      if (refs.length === 0) return ABSENT;
      if (refs.length > field.maxFiles)
        return issue('too_many_files', `At most ${field.maxFiles} files.`, {
          max: field.maxFiles,
        });
      return { value: refs };
    }
    default:
      return issue('invalid_type', 'Unsupported field.');
  }
}

/**
 * Validates and normalizes one submission against the form version it is submitted to. Values
 * never appear in errors; `file` refs are checked for shape only, the `files` capability claims
 * them in the submit transaction.
 */
export function validateSubmission(
  config: FormsConfig,
  input: unknown,
  options: { transport: SubmissionTransport; now: Date; formKey: string },
): NormalizedSubmission {
  const errors: FieldError[] = [];
  const fail = (path: string, entry: Issue) => errors.push({ path, ...entry });
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new AppError('validation_failed', {
      detail: 'The submission must be an object of field values.',
      errors: [{ path: '', code: 'invalid_type', message: 'Must be an object.' }],
      hint: hint(options.formKey),
    });
  const answers = new Map(Object.entries(input));
  const known = new Set(config.fields.map((field) => field.key));
  for (const key of answers.keys())
    if (!known.has(key))
      fail(key, { code: 'unknown_field', message: 'This field does not exist.' });
  const data: Record<string, JsonValue> = {};
  let subjectEmail: string | null = null;
  for (const field of config.fields) {
    const result = fieldValue(field, answers.get(field.key), options.transport, options.now);
    if ('issue' in result) fail(field.key, result.issue);
    else if (result.value === undefined) {
      if (field.required)
        fail(
          field.key,
          field.type === 'consent'
            ? { code: 'must_accept', message: 'Must be accepted.' }
            : { code: 'required', message: 'This field is required.' },
        );
    } else {
      data[field.key] = result.value;
      if (field.type === 'email' && field.identifiesSubject && typeof result.value === 'string')
        subjectEmail = result.value;
    }
  }
  if (errors.length)
    throw new AppError('validation_failed', {
      detail: `${errors.length} ${errors.length === 1 ? 'field is' : 'fields are'} invalid.`,
      errors,
      hint: hint(options.formKey),
    });
  return { data, subjectEmail };
}

const hint = (formKey: string) =>
  `Fetch the form schema via GET /v1/public/forms/${formKey} to see all constraints.`;
