/**
 * Integration snippets for one form: the dashboard's Embed tab shows them and
 * `examples.test.ts` checks that `examples/html` contains exactly these texts, so this module is
 * the only place they are written. Pure functions over the form's config; no React.
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
/** `sdkForm` is the markup the `sdk` script expects; together they are the SDK variant. */
export type FormSnippets = { html: string; sdkForm: string; sdk: string; server: string };

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
/** A single-quoted JavaScript string literal. */
const quote = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const required = (field: ConfigField) => (field.required ? ' required' : '');
const publishableKey = (input: SnippetInput) => input.publishableKey ?? PUBLISHABLE_KEY_PLACEHOLDER;
/** Element ID of the SDK variant's form; form keys are lowercase letters, digits and dashes. */
export const sdkFormId = (formKey: string) => `backbricks-${formKey}`;

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

const formMarkup = (input: SnippetInput, opening: string, extra: string[] = []) =>
  [
    opening,
    ...input.fields.flatMap(htmlField),
    '  <div hidden>',
    `    <input name="${input.honeypotField}" tabindex="-1" autocomplete="off">`,
    '  </div>',
    ...extra,
    '  <button type="submit">Send</button>',
    '</form>',
    '',
  ].join('\n');

/** Plain HTML without JavaScript: needs proof-of-work off and a success page (Q13). */
export function htmlSnippet(input: SnippetInput): string {
  const action = `${input.baseUrl}/public/forms/${input.formKey}/submissions?key=${publishableKey(input)}`;
  return formMarkup(input, `<form method="post" action="${escapeHtml(action)}">`);
}

/** The form for the SDK script: no action; an `<output>` shows the result. */
export function sdkFormSnippet(input: SnippetInput): string {
  return formMarkup(input, `<form id="${sdkFormId(input.formKey)}">`, ['  <output></output>']);
}

/** How the script reads each field from the form, matching what the server expects. */
function readValue(field: ConfigField): string {
  const name = quote(field.key);
  switch (field.type) {
    case 'checkbox':
    case 'consent':
      return `fields.has(${name})`;
    case 'multiselect':
      return `fields.getAll(${name})`;
    case 'number':
      return `text(${name}) && Number(text(${name}))`;
    default:
      return `text(${name})`;
  }
}

/** Browser script with the SDK, which solves proof-of-work automatically (P2.9a). */
export function sdkSnippet(input: SnippetInput): string {
  return [
    "import { BackbricksError, createClient } from '@backbricks/sdk';",
    '',
    'const backbricks = createClient({',
    `  publishableKey: ${quote(publishableKey(input))},`,
    `  baseUrl: ${quote(input.baseUrl)},`,
    '});',
    '',
    `const form = document.getElementById(${quote(sdkFormId(input.formKey))});`,
    "const result = form.querySelector('output');",
    '',
    'async function send() {',
    '  const fields = new FormData(form);',
    '  // Empty inputs are left out, so the server reports missing required fields.',
    '  const text = (name) => fields.get(name) || undefined;',
    "  form.querySelector('button').disabled = true;",
    '  try {',
    '    await backbricks.forms.submit(',
    `      ${quote(input.formKey)},`,
    '      {',
    ...input.fields
      .filter((field) => field.type !== 'file')
      .map((field) => `        ${field.key}: ${readValue(field)},`),
    '      },',
    `      { honeypot: text(${quote(input.honeypotField)}) },`,
    '    );',
    '    form.reset();',
    "    result.textContent = 'Thank you! Your message was sent.';",
    '  } catch (error) {',
    '    if (!(error instanceof BackbricksError)) throw error;',
    '    result.textContent = error.fieldErrors.length',
    "      ? error.fieldErrors.map((field) => `${field.path}: ${field.message}`).join(' ')",
    '      : error.message;',
    '  } finally {',
    "    form.querySelector('button').disabled = false;",
    '  }',
    '}',
    '',
    "form.addEventListener('submit', (event) => {",
    '  event.preventDefault();',
    '  void send();',
    '});',
    '',
  ].join('\n');
}

/** Example values by field type, so the server snippet shows the shape each field expects. */
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
      return quote(field.options?.[0]?.value ?? '');
    case 'multiselect':
      return `[${quote(field.options?.[0]?.value ?? '')}]`;
    case 'phone':
      return "'+49 30 1234567'";
    default:
      return "'…'";
  }
}

/** Server-to-server with a secret key (skips proof-of-work); never in browser code. */
export function serverSnippet(input: SnippetInput): string {
  return [
    `const response = await fetch(${quote(`${input.baseUrl}/public/forms/${input.formKey}/submissions`)}, {`,
    "  method: 'POST',",
    '  headers: {',
    `    Authorization: \`Bearer \${process.env.${SECRET_KEY_ENV}}\`,`,
    "    'Content-Type': 'application/json',",
    '  },',
    '  body: JSON.stringify({',
    '    data: {',
    ...input.fields
      .filter((field) => field.type !== 'file' && field.type !== 'hidden')
      .map((field) => `      ${field.key}: ${sampleValue(field)},`),
    '    },',
    '  }),',
    '});',
    'if (!response.ok) throw new Error((await response.json()).detail);',
    '',
  ].join('\n');
}

export function formSnippets(input: SnippetInput): FormSnippets {
  return {
    html: htmlSnippet(input),
    sdkForm: sdkFormSnippet(input),
    sdk: sdkSnippet(input),
    server: serverSnippet(input),
  };
}
