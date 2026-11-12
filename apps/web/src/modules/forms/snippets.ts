/**
 * Integration snippets for one form: the dashboard's Embed tab shows them and the
 * `examples/html` test (P2.9b) compares the example files against them, so this module is the
 * only place their text is written. Pure functions over the form's config; no React.
 */
import type { ConfigField } from './entries-view.ts';

export type SnippetInput = {
  /** API v1 base URL from the integration endpoint, ending in `/v1`. */
  baseUrl: string;
  /** Active publishable key, or `null` when the project has none yet. */
  publishableKey: string | null;
  formKey: string;
  fields: readonly ConfigField[];
  honeypotField: string;
};
export type FormSnippets = { html: string; sdk: string; server: string };

export const PUBLISHABLE_KEY_PLACEHOLDER = 'YOUR_PUBLISHABLE_KEY';
export const SECRET_KEY_ENV = 'BACKBRICKS_SECRET_KEY';

/** Generated code is pasted into websites, so labels and texts from the config are escaped. */
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const required = (field: ConfigField) => (field.required ? ' required' : '');

const INPUT_TYPES: Record<string, string> = {
  text: 'text',
  email: 'email',
  phone: 'tel',
  number: 'number',
  url: 'url',
  date: 'date',
};

function htmlField(field: ConfigField): string[] {
  const label = escapeHtml(field.label);
  const name = `name="${field.key}"`;
  switch (field.type) {
    case 'textarea':
      return [
        `  <label>${label}`,
        `    <textarea ${name}${required(field)}></textarea>`,
        '  </label>',
      ];
    case 'select':
      return [
        `  <label>${label}`,
        `    <select ${name}${required(field)}>`,
        ...(field.options ?? []).map(
          (option) => `      <option value="${option.value}">${escapeHtml(option.label)}</option>`,
        ),
        '    </select>',
        '  </label>',
      ];
    case 'multiselect':
      return [
        '  <fieldset>',
        `    <legend>${label}</legend>`,
        ...(field.options ?? []).map(
          (option) =>
            `    <label><input type="checkbox" ${name} value="${option.value}"> ${escapeHtml(option.label)}</label>`,
        ),
        '  </fieldset>',
      ];
    case 'checkbox':
      return [`  <label><input type="checkbox" ${name}${required(field)}> ${label}</label>`];
    case 'consent':
      return [
        `  <label><input type="checkbox" ${name} required> ${escapeHtml(field.text ?? field.label)}</label>`,
      ];
    case 'hidden':
      return [`  <input type="hidden" ${name} value="">`];
    case 'file':
      return [`  <!-- "${field.key}": file fields need JavaScript; use the SDK. -->`];
    default:
      return [
        `  <label>${label}`,
        `    <input type="${INPUT_TYPES[field.type] ?? 'text'}" ${name}${required(field)}>`,
        '  </label>',
      ];
  }
}

/** Plain HTML without JavaScript: needs proof-of-work off and a success page (Q13). */
export function htmlSnippet(input: SnippetInput): string {
  const key = input.publishableKey ?? PUBLISHABLE_KEY_PLACEHOLDER;
  const action = `${input.baseUrl}/public/forms/${input.formKey}/submissions?key=${key}`;
  return [
    `<form method="post" action="${escapeHtml(action)}">`,
    ...input.fields.flatMap(htmlField),
    '  <div hidden>',
    `    <input name="${input.honeypotField}" tabindex="-1" autocomplete="off">`,
    '  </div>',
    '  <button type="submit">Send</button>',
    '</form>',
    '',
  ].join('\n');
}

/** Example values by field type, so the snippet shows the shape each field expects. */
function sampleValue(field: ConfigField): string {
  switch (field.type) {
    case 'email':
      return "'person@example.com'";
    case 'number':
      return '1';
    case 'url':
      return "'https://example.com'";
    case 'date':
      return "'2026-01-31'";
    case 'checkbox':
    case 'consent':
      return 'true';
    case 'select':
      return `'${field.options?.[0]?.value ?? ''}'`;
    case 'multiselect':
      return `['${field.options?.[0]?.value ?? ''}']`;
    case 'phone':
      return "'+49 30 1234567'";
    default:
      return "'…'";
  }
}

const dataLines = (fields: readonly ConfigField[], indent: string) =>
  fields
    .filter((field) => field.type !== 'file' && field.type !== 'hidden')
    .map((field) => `${indent}${field.key}: ${sampleValue(field)},`);

/** Browser code with the SDK, which solves proof-of-work automatically (P2.9a). */
export function sdkSnippet(input: SnippetInput): string {
  return [
    "import { createClient } from '@backbricks/sdk';",
    '',
    'const backbricks = createClient({',
    `  publishableKey: '${input.publishableKey ?? PUBLISHABLE_KEY_PLACEHOLDER}',`,
    `  baseUrl: '${input.baseUrl}',`,
    '});',
    '',
    `await backbricks.forms.submit('${input.formKey}', {`,
    ...dataLines(input.fields, '  '),
    '});',
    '',
  ].join('\n');
}

/** Server-to-server with a secret key (skips proof-of-work); never in browser code. */
export function serverSnippet(input: SnippetInput): string {
  return [
    `const response = await fetch('${input.baseUrl}/public/forms/${input.formKey}/submissions', {`,
    "  method: 'POST',",
    '  headers: {',
    `    Authorization: \`Bearer \${process.env.${SECRET_KEY_ENV}}\`,`,
    "    'Content-Type': 'application/json',",
    '  },',
    '  body: JSON.stringify({',
    '    data: {',
    ...dataLines(input.fields, '      '),
    '    },',
    '  }),',
    '});',
    'if (!response.ok) throw new Error((await response.json()).detail);',
    '',
  ].join('\n');
}

export function formSnippets(input: SnippetInput): FormSnippets {
  return { html: htmlSnippet(input), sdk: sdkSnippet(input), server: serverSnippet(input) };
}
