import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { moduleInstanceSchema } from '../platform/models.ts';
import type { ConfiguredInstance } from './contract.ts';
import { freezeDeclaration, schemaDocument } from './validation.ts';
import {
  canonicalJson,
  configChangeReportSchema,
  jsonValueSchema,
  moduleNameSchema,
} from './values.ts';

/** Configurations stay JSON values at storage/API boundaries and typed values inside callbacks. */
export function configuration<T>(definition: {
  type: string;
  moduleVersion: number;
  configSchema: z.ZodType<T>;
  defaultConfig(this: void): T;
  templates?: Readonly<Record<string, { name: string; config: T }>>;
  migrateConfig?(this: void, fromVersion: number, config: unknown): T;
  validateConfigChange?(this: void, previous: T, next: T): z.infer<typeof configChangeReportSchema>;
  codegen?(this: void, instance: ConfiguredInstance<T>): string;
}) {
  const {
    type,
    moduleVersion,
    configSchema,
    defaultConfig,
    migrateConfig,
    validateConfigChange,
    codegen,
  } = definition;
  const configJsonSchema = freezeDeclaration(schemaDocument(configSchema));
  function parseConfig(input: unknown) {
    return jsonValueSchema.parse(configSchema.parse(input));
  }
  function instance(input: unknown): ConfiguredInstance<T> {
    const parsed = moduleInstanceSchema.parse(input);
    if (parsed.moduleType !== type || parsed.moduleVersion !== moduleVersion)
      throw new AppError('invalid_request', {
        detail: 'Module configuration version does not match.',
      });
    return { ...parsed, config: configSchema.parse(parsed.config) };
  }
  // Validate defaults/templates during startup, and return fresh values to each caller.
  const defaults = parseConfig(defaultConfig());
  const templates = Object.fromEntries(
    Object.entries(definition.templates ?? {}).map(([key, value]) => [
      moduleNameSchema.parse(key),
      { name: z.string().min(1).max(200).parse(value.name), config: parseConfig(value.config) },
    ]),
  );
  return {
    configSchema,
    configJsonSchema,
    templates: freezeDeclaration(templates),
    parseConfig,
    instance,
    defaultConfig: () => structuredClone(defaults),
    migrateConfig(fromVersion: number, input: unknown) {
      z.number().int().positive().max(moduleVersion).parse(fromVersion);
      if (fromVersion === moduleVersion) return parseConfig(input);
      if (!migrateConfig)
        throw new AppError('invalid_request', { detail: 'A configuration migration is required.' });
      return parseConfig(migrateConfig(fromVersion, input));
    },
    validateConfigChange(previous: unknown, next: unknown) {
      const before = configSchema.parse(previous);
      const after = configSchema.parse(next);
      if (
        canonicalJson(jsonValueSchema.parse(before)) === canonicalJson(jsonValueSchema.parse(after))
      )
        return { destructive: false, changedPaths: [], warnings: [] };
      // An unclassified change must never bypass destructive-change approval.
      return configChangeReportSchema.parse(
        validateConfigChange?.(before, after) ?? {
          destructive: true,
          changedPaths: ['$'],
          warnings: [],
        },
      );
    },
    codegen: (input: unknown) => (codegen ? z.string().parse(codegen(instance(input))) : null),
  };
}
