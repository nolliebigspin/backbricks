import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { pageResult } from '../http/pagination.ts';
import type { Ids } from '../ids/type-id.ts';
import type { RegisteredModule } from '../modules/registered.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { canonicalJson, jsonValueSchema } from '../modules/values.ts';
import type { ModuleInstance } from '../platform/models.ts';
import { principalActor, type AuditService, type EventService } from '../services/activity.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { RepositoryPage } from '../tenancy/repositories.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { mergeConfigPatch } from './merge-patch.ts';
import { requireConfigAccess } from './permissions.ts';
import {
  instanceCreateSchema,
  instancePatchSchema,
  instanceVersionSchema,
  MAX_INSTANCE_VERSION,
  type InstanceCreate,
  type InstancePatch,
} from './schemas.ts';

function parseConfig(module: RegisteredModule, config: unknown) {
  try {
    return module.parseConfig(config);
  } catch (error) {
    if (error instanceof ZodError)
      throw new AppError('validation_failed', { detail: 'The module configuration is invalid.' });
    throw error;
  }
}

async function current(tx: TenantTransaction, type: string, key: string) {
  const value = await tx.repositories.instances.getByKey(type, key);
  if (value.status === 'archived') throw new AppError('not_found');
  return value;
}

function checkVersion(previous: ModuleInstance, version: number) {
  instanceVersionSchema.parse(version);
  if (previous.configVersion !== version || version === MAX_INSTANCE_VERSION)
    throw new AppError('conflict');
}

/** Registry-driven lifecycle. All data, revision, audit and outbox writes use the caller transaction. */
export function createInstanceService(deps: {
  registry: ModuleRegistry;
  runtime: ReturnType<ModuleRegistry['bind']>;
  clock: Clock;
  ids: Ids;
  audit: AuditService;
  events: EventService;
}) {
  async function moduleFor(tx: TenantTransaction, type: string, access: 'read' | 'write') {
    if (!tx.context.projectId) throw new AppError('not_found');
    // Serialize mutations with project archival and config-as-code's future project-wide apply.
    await tx.repositories.projects.get(tx.context.projectId, { lock: access === 'write' });
    const module = deps.registry.get(type);
    if (!module) throw new AppError('module_not_enabled');
    requireConfigAccess(tx, access);
    return module;
  }
  async function record(
    tx: TenantTransaction,
    action: string,
    instance: ModuleInstance,
    changedFields: string[],
    previousVersion?: number,
    requestId?: string,
  ) {
    const principal = requireConfigAccess(tx, 'write');
    const actor = principalActor(principal);
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
    async list(tx: TenantTransaction, type: string, page: RepositoryPage) {
      await moduleFor(tx, type, 'read');
      return pageResult(
        await tx.repositories.instances.list(page, type, { includeArchived: false }),
        page.limit,
      );
    },
    async get(tx: TenantTransaction, type: string, key: string) {
      await moduleFor(tx, type, 'read');
      return current(tx, type, key);
    },
    async create(tx: TenantTransaction, type: string, input: InstanceCreate, requestId?: string) {
      const module = await moduleFor(tx, type, 'write');
      const data = instanceCreateSchema.parse(input);
      const now = deps.clock.now();
      const instance = await tx.repositories.instances.insert({
        ...data,
        config:
          data.config === undefined ? module.defaultConfig() : parseConfig(module, data.config),
        id: deps.ids.generate('mod'),
        moduleType: type,
        configVersion: 1,
        moduleVersion: module.moduleVersion,
        createdAt: now,
        updatedAt: now,
      });
      await record(
        tx,
        CORE_EVENTS.instanceCreated,
        instance,
        ['name', 'status', 'config'],
        undefined,
        requestId,
      );
      return instance;
    },
    async update(
      tx: TenantTransaction,
      type: string,
      key: string,
      input: InstancePatch,
      requestId?: string,
    ) {
      const module = await moduleFor(tx, type, 'write');
      const data = instancePatchSchema.parse(input);
      const previous = await current(tx, type, key);
      checkVersion(previous, data.configVersion);
      if (previous.moduleVersion !== module.moduleVersion)
        throw new AppError('conflict', { detail: 'A configuration migration is required.' });
      const config =
        data.config === undefined
          ? jsonValueSchema.parse(previous.config)
          : parseConfig(
              module,
              mergeConfigPatch(
                jsonValueSchema.parse(previous.config),
                jsonValueSchema.parse(data.config),
              ),
            );
      const configChanged =
        canonicalJson(jsonValueSchema.parse(previous.config)) !== canonicalJson(config);
      if (configChanged)
        requireConfigAccess(
          tx,
          'write',
          module.validateConfigChange(previous.config, config).destructive,
        );
      const changedFields = [
        ...(data.name !== undefined && data.name !== previous.name ? ['name'] : []),
        ...(data.status !== undefined && data.status !== previous.status ? ['status'] : []),
        ...(configChanged ? ['config'] : []),
      ];
      if (!changedFields.length) return previous;
      const instance = await tx.repositories.instances.update(previous.id, data.configVersion, {
        name: data.name ?? previous.name,
        status: data.status ?? previous.status,
        config,
        configVersion: previous.configVersion + 1,
        updatedAt: deps.clock.now(),
      });
      if (configChanged)
        await module.retention.recomputeExpiry(
          deps.runtime.forTenant(tx).execution(type),
          instance,
          deps.clock.now(),
        );
      await record(
        tx,
        CORE_EVENTS.instanceUpdated,
        instance,
        changedFields,
        previous.configVersion,
        requestId,
      );
      return instance;
    },
    async archive(
      tx: TenantTransaction,
      type: string,
      key: string,
      version: number,
      requestId?: string,
    ) {
      await moduleFor(tx, type, 'write');
      const previous = await current(tx, type, key);
      requireConfigAccess(tx, 'write', true);
      checkVersion(previous, version);
      const instance = await tx.repositories.instances.update(previous.id, version, {
        status: 'archived',
        configVersion: previous.configVersion + 1,
        updatedAt: deps.clock.now(),
      });
      await record(
        tx,
        CORE_EVENTS.instanceArchived,
        instance,
        ['status'],
        previous.configVersion,
        requestId,
      );
    },
  };
}
export type InstanceService = ReturnType<typeof createInstanceService>;
