import { AppError } from '../errors/app-error.ts';
import { pageResult } from '../http/pagination.ts';
import { jsonValueSchema } from '../modules/values.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { RepositoryPage } from '../tenancy/repositories.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import { mergeConfigPatch } from './merge-patch.ts';
import { requireConfigAccess } from './permissions.ts';
import {
  activeInstance,
  checkInstanceVersion,
  instancePersistence,
  instanceView,
  validatedConfig,
  type InstanceDependencies,
} from './persistence.ts';
import {
  instanceCreateSchema,
  instancePatchSchema,
  type InstanceCreate,
  type InstancePatch,
} from './schemas.ts';

/** Registry-driven lifecycle; all writes enlist in the caller's transaction. */
export function createInstanceService(deps: InstanceDependencies) {
  const { record, save } = instancePersistence(deps);
  async function moduleFor(tx: TenantTransaction, type: string, access: 'read' | 'write') {
    if (!tx.context.projectId) throw new AppError('not_found');
    // Serialize mutations with project archival and config-as-code's future project-wide apply.
    await tx.repositories.projects.get(tx.context.projectId, { lock: access === 'write' });
    const module = deps.registry.get(type);
    if (!module) throw new AppError('module_not_enabled');
    requireConfigAccess(tx, access);
    return module;
  }
  return {
    async list(tx: TenantTransaction, type: string, page: RepositoryPage) {
      const module = await moduleFor(tx, type, 'read');
      const pageData = pageResult(
        await tx.repositories.instances.list(page, type, { includeArchived: false }),
        page.limit,
      );
      return { ...pageData, data: pageData.data.map((row) => instanceView(module, row)) };
    },
    async get(tx: TenantTransaction, type: string, key: string) {
      const module = await moduleFor(tx, type, 'read');
      return instanceView(module, await activeInstance(tx, type, key));
    },
    async create(tx: TenantTransaction, type: string, input: InstanceCreate, requestId?: string) {
      const module = await moduleFor(tx, type, 'write');
      const data = instanceCreateSchema.parse(input);
      const now = deps.clock.now();
      const instance = await tx.repositories.instances.insert({
        ...data,
        config:
          data.config === undefined ? module.defaultConfig() : validatedConfig(module, data.config),
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
      const previous = await activeInstance(tx, type, key);
      checkInstanceVersion(previous, data.configVersion);
      const before = validatedConfig(module, previous.config, previous.moduleVersion);
      const config =
        data.config === undefined
          ? before
          : validatedConfig(module, mergeConfigPatch(before, jsonValueSchema.parse(data.config)));
      return save(
        tx,
        module,
        previous,
        { config, name: data.name, status: data.status },
        requestId,
      );
    },
    async revisions(tx: TenantTransaction, type: string, key: string, page: RepositoryPage) {
      await moduleFor(tx, type, 'read');
      const instance = await activeInstance(tx, type, key);
      return pageResult(await tx.repositories.revisions.list(instance.id, page), page.limit);
    },
    async revision(tx: TenantTransaction, type: string, key: string, version: number) {
      await moduleFor(tx, type, 'read');
      const instance = await activeInstance(tx, type, key);
      return tx.repositories.revisions.get(instance.id, version);
    },
    async rollback(
      tx: TenantTransaction,
      type: string,
      key: string,
      version: number,
      expected: number,
      requestId?: string,
    ) {
      const module = await moduleFor(tx, type, 'write');
      const previous = await activeInstance(tx, type, key);
      checkInstanceVersion(previous, expected);
      const revision = await tx.repositories.revisions.get(previous.id, version);
      const config = validatedConfig(module, revision.config, revision.moduleVersion);
      return save(
        tx,
        module,
        previous,
        { config },
        requestId,
        CORE_EVENTS.instanceRolledBack,
        true,
      );
    },
    async migrate(
      tx: TenantTransaction,
      type: string,
      key: string,
      expected: number,
      requestId?: string,
    ) {
      const module = await moduleFor(tx, type, 'write');
      const previous = await activeInstance(tx, type, key);
      checkInstanceVersion(previous, expected);
      return save(
        tx,
        module,
        previous,
        { config: validatedConfig(module, previous.config, previous.moduleVersion) },
        requestId,
        CORE_EVENTS.instanceMigrated,
      );
    },
    async archive(
      tx: TenantTransaction,
      type: string,
      key: string,
      version: number,
      requestId?: string,
    ) {
      await moduleFor(tx, type, 'write');
      const previous = await activeInstance(tx, type, key);
      requireConfigAccess(tx, 'write', true);
      checkInstanceVersion(previous, version);
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
