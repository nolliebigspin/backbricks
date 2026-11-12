import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.ts';
import type { Ids } from '../ids/type-id.ts';
import type { RegisteredModule } from '../modules/registered.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { canonicalJson, jsonValueSchema, type JsonValue } from '../modules/values.ts';
import type { ModuleInstance } from '../platform/models.ts';
import { principalActor, type AuditService, type EventService } from '../services/activity.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { requireConfigAccess } from './permissions.ts';
import { instanceVersionSchema, MAX_INSTANCE_VERSION } from './schemas.ts';

export type InstanceDependencies = {
  registry: ModuleRegistry;
  runtime: ReturnType<ModuleRegistry['bind']>;
  clock: Clock;
  ids: Ids;
  audit: AuditService;
  events: EventService;
};

export function validatedConfig(
  module: RegisteredModule,
  input: unknown,
  fromVersion = module.moduleVersion,
) {
  try {
    return module.migrateConfig(fromVersion, input);
  } catch (error) {
    if (error instanceof ZodError) throw configProblem(error);
    if (error instanceof AppError)
      throw new AppError('validation_failed', {
        detail: 'The configuration format is invalid or unsupported.',
      });
    throw error;
  }
}

/**
 * Config issues keep their paths (relative to the module config) so editors and agents can point
 * at the field. Messages come only from module refinements; built-in ones are replaced so no
 * input is echoed. A refinement tagged `{ code: 'capability_unavailable' }` becomes that problem.
 */
function configProblem(error: ZodError) {
  const errors = error.issues.slice(0, 100).map((issue) => {
    const tagged = issue.code === 'custom' ? Reflect.get(issue.params ?? {}, 'code') : undefined;
    return {
      path: issue.path.map(String).join('.'),
      code: typeof tagged === 'string' ? tagged : issue.code,
      message: issue.code === 'custom' ? issue.message : 'Invalid value.',
    };
  });
  return errors.some((entry) => entry.code === 'capability_unavailable')
    ? new AppError('capability_unavailable', {
        detail: 'The configuration uses a feature whose module is not enabled.',
        errors,
      })
    : new AppError('validation_failed', { detail: 'The configuration is invalid.', errors });
}

export function checkInstanceVersion(previous: ModuleInstance, version: number) {
  instanceVersionSchema.parse(version);
  if (previous.configVersion !== version || version === MAX_INSTANCE_VERSION)
    throw new AppError('conflict');
}

export async function activeInstance(tx: TenantTransaction, type: string, key: string) {
  const instance = await tx.repositories.instances.getByKey(type, key);
  if (instance.status === 'archived') throw new AppError('not_found');
  return instance;
}

/** Lazy views disclose the stored format separately and never write during a read. */
export function instanceView(module: RegisteredModule, instance: ModuleInstance) {
  return {
    ...instance,
    config: validatedConfig(module, instance.config, instance.moduleVersion),
    moduleVersion: module.moduleVersion,
    storedModuleVersion: instance.moduleVersion,
  };
}

export function instancePersistence(
  deps: InstanceDependencies,
  authority: 'request' | 'system' = 'request',
) {
  async function record(
    tx: TenantTransaction,
    action: string,
    instance: ModuleInstance,
    changedFields: string[],
    previousVersion?: number,
    requestId?: string,
  ) {
    const actor =
      authority === 'system'
        ? { actorType: 'system' as const, actorId: null }
        : principalActor(requireConfigAccess(tx, 'write'));
    await tx.repositories.revisions.insert({
      id: deps.ids.generate('rvn'),
      instanceId: instance.id,
      configVersion: instance.configVersion,
      moduleVersion: instance.moduleVersion,
      config: instance.config,
      ...actor,
      actorId: actor.actorId ?? null,
      createdAt: deps.clock.now(),
    });
    const changes = {
      changedFields,
      configVersion: instance.configVersion,
      ...(previousVersion ? { previousVersion } : {}),
    };
    await deps.audit.record(tx, {
      ...actor,
      action,
      targetType: 'module_instance',
      targetId: instance.id,
      changes,
      requestId,
    });
    await deps.events.publish(tx, {
      type: action,
      subjectType: 'module_instance',
      subjectId: instance.id,
      payload: changes,
    });
  }
  return {
    record,
    async save(
      this: void,
      tx: TenantTransaction,
      module: RegisteredModule,
      previous: ModuleInstance,
      next: { config: JsonValue; name?: string; status?: ModuleInstance['status'] },
      requestId?: string,
      action: string = CORE_EVENTS.instanceUpdated,
      force = false,
    ) {
      const before = validatedConfig(module, previous.config, previous.moduleVersion);
      const migrating = previous.moduleVersion !== module.moduleVersion;
      const changedConfig =
        migrating ||
        canonicalJson(jsonValueSchema.parse(previous.config)) !== canonicalJson(next.config);
      if (authority === 'request')
        requireConfigAccess(
          tx,
          'write',
          migrating ||
            (changedConfig && module.validateConfigChange(before, next.config).destructive),
        );
      const changedFields = [
        ...(next.name !== undefined && next.name !== previous.name ? ['name'] : []),
        ...(next.status !== undefined && next.status !== previous.status ? ['status'] : []),
        ...(changedConfig ? ['config'] : []),
        ...(migrating ? ['moduleVersion'] : []),
      ];
      if (!force && !changedFields.length) return previous;
      checkInstanceVersion(previous, previous.configVersion);
      const instance = await tx.repositories.instances.update(previous.id, previous.configVersion, {
        ...next,
        configVersion: previous.configVersion + 1,
        moduleVersion: module.moduleVersion,
        updatedAt: deps.clock.now(),
      });
      if (changedConfig)
        await module.retention.recomputeExpiry(
          deps.runtime.forTenant(tx).execution(module.type),
          instance,
          deps.clock.now(),
        );
      await record(tx, action, instance, changedFields, previous.configVersion, requestId);
      return instance;
    },
  };
}
