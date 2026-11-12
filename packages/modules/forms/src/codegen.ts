import type { ConfiguredInstance } from '@backbricks/core';

import type { FormField, FormsConfig } from './config.ts';

/** The submit value type a website sends for one field (the server validator is authoritative). */
function valueType(field: FormField): string {
  switch (field.type) {
    case 'number':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'consent':
      return 'true';
    case 'select':
      return field.options.map((option) => JSON.stringify(option.value)).join(' | ');
    case 'multiselect':
      return `Array<${field.options.map((option) => JSON.stringify(option.value)).join(' | ')}>`;
    case 'file':
      return 'string[]';
    default:
      return 'string';
  }
}

/**
 * Emits one `BackbricksSchema` member per form (ARCHITECTURE §D.7): `'forms/<key>'` maps to the
 * submit payload, so several forms and modules merge into the same interface. Only keys, types
 * and option values (all restricted to safe characters and JSON-quoted) are emitted; labels and
 * other owner text never reach the generated code.
 */
export function formsCodegen(instance: ConfiguredInstance<FormsConfig>): string {
  const members = instance.config.fields
    .map(
      (field) =>
        `      ${JSON.stringify(field.key)}${field.required ? '' : '?'}: ${valueType(field)};`,
    )
    .join('\n');
  return [
    `declare module '@backbricks/sdk' {`,
    `  interface BackbricksSchema {`,
    `    ${JSON.stringify(`forms/${instance.key}`)}: {`,
    members,
    `    };`,
    `  }`,
    `}`,
    `export {};`,
  ].join('\n');
}
