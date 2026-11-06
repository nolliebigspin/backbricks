import type { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { validatedConfig } from '../instances/persistence.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { canonicalJson, jsonValueSchema } from '../modules/values.ts';
import type { ModuleInstance } from '../platform/models.ts';
import {
  configDocumentSchema,
  configEntrySchema,
  configChangeSchema,
  type ConfigDocument,
} from './schemas.ts';

const operationSchema = configChangeSchema.extend({ desired: configEntrySchema.optional() });
type Operation = z.infer<typeof operationSchema>;
const entries = <T>(value: Record<string, T>) =>
  Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** Pure normalization/diff. Only explicitly present module sections can archive configurations. */
export function planConfiguration(
  registry: ModuleRegistry,
  input: unknown,
  current: readonly ModuleInstance[],
) {
  const document = configDocumentSchema.parse(input);
  const modules: ConfigDocument['modules'] = {};
  const operations: Operation[] = [];
  const warnings: string[] = [];
  for (const [resource, desired] of entries(document.modules)) {
    const module = registry.modules.find((item) => item.resourceName.plural === resource);
    if (!module) throw new AppError('module_not_enabled');
    const existing = new Map(
      current.filter((row) => row.moduleType === module.type).map((row) => [row.key, row]),
    );
    const normalized: Record<string, z.infer<typeof configEntrySchema>> = {};
    for (const [key, entry] of entries(desired)) {
      const previous = existing.get(key);
      if (previous?.status === 'archived')
        throw new AppError('conflict', { detail: 'An archived instance reserves this key.' });
      if (
        previous
          ? entry.configVersion !== previous.configVersion
          : entry.configVersion !== undefined
      )
        throw new AppError('conflict', { detail: 'The configuration version is stale.' });
      const config = validatedConfig(module, entry.config, entry.moduleVersion);
      const next = {
        name: entry.name,
        status: entry.status,
        moduleVersion: module.moduleVersion,
        config,
        ...(previous ? { configVersion: previous.configVersion } : {}),
      };
      Object.defineProperty(normalized, key, { value: next, enumerable: true });
      if (!previous) {
        operations.push({
          moduleType: module.type,
          resource,
          key,
          kind: 'create',
          destructive: false,
          changedPaths: ['$'],
          desired: next,
        });
        continue;
      }
      const before = validatedConfig(module, previous.config, previous.moduleVersion);
      const report = module.validateConfigChange(before, config);
      const migrating = previous.moduleVersion !== module.moduleVersion;
      const paths = [
        ...(next.name !== previous.name ? ['name'] : []),
        ...(next.status !== previous.status ? ['status'] : []),
        ...(canonicalJson(jsonValueSchema.parse(previous.config)) !== canonicalJson(config)
          ? ['config']
          : []),
        ...(migrating ? ['moduleVersion'] : []),
      ];
      if (paths.length)
        operations.push({
          moduleType: module.type,
          resource,
          key,
          kind: 'update',
          destructive: migrating || report.destructive,
          changedPaths: [...paths, ...report.changedPaths],
          desired: next,
        });
      warnings.push(...report.warnings);
    }
    for (const row of [...existing.values()].toSorted((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    )) {
      if (row.status !== 'archived' && !Object.hasOwn(desired, row.key))
        operations.push({
          moduleType: module.type,
          resource,
          key: row.key,
          kind: 'archive',
          destructive: true,
          changedPaths: ['status'],
        });
    }
    Object.defineProperty(modules, resource, { value: normalized, enumerable: true });
  }
  return {
    document: { ...document, modules },
    operations,
    warnings,
    destructive: operations.some((item) => item.destructive),
  };
}
