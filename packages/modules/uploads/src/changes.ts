import { canonicalJson, jsonValueSchema, type ConfigChangeReport } from '@backbricks/core';

import { uploadConfigWarnings, type UploadsConfig } from './config.ts';

const same = (a: unknown, b: unknown) =>
  canonicalJson(jsonValueSchema.parse(a ?? null)) ===
  canonicalJson(jsonValueSchema.parse(b ?? null));

/** Tightening acceptance/deletion rules needs destructive approval; new unclassified rules fail closed. */
export function classifyUploadsChange(
  previous: UploadsConfig,
  next: UploadsConfig,
): ConfigChangeReport {
  const changedPaths: string[] = [];
  const warnings = uploadConfigWarnings(next);
  let destructive = false;
  for (const property of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (same(Reflect.get(previous, property), Reflect.get(next, property))) continue;
    changedPaths.push(property === 'spam' ? 'spam.honeypotField' : property);
    switch (property) {
      case 'presets':
        destructive ||= previous.presets.some((preset) => !next.presets.includes(preset));
        break;
      case 'maxSizeMb':
        destructive ||= next.maxSizeMb < previous.maxSizeMb;
        break;
      case 'retentionDays':
        if (
          next.retentionDays !== null &&
          (previous.retentionDays === null || next.retentionDays < previous.retentionDays)
        ) {
          destructive = true;
          warnings.push('Existing files receive the shorter expiry and may be deleted.');
        }
        break;
      case 'scanRequired':
        destructive = true;
        warnings.push(
          'The scanning requirement changed. Existing ready files keep their recorded scan result.',
        );
        break;
      case 'spam':
        warnings.push('The honeypot field changed; update it on your website.');
        break;
      case 'limits':
        break;
      default:
        destructive = true;
    }
  }
  return { destructive, changedPaths, warnings };
}
