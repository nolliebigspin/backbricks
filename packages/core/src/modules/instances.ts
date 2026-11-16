import { AppError } from '../errors/app-error.ts';
import { activeInstance } from '../instances/persistence.ts';
import { instanceKeySchema, instanceVersionSchema } from '../instances/schemas.ts';
import type { ModuleInstance } from '../platform/models.ts';
import type { ConfiguredInstance, ModuleInstanceReads } from './contract.ts';
import type { ModuleExecution } from './execution.ts';

/** Never accepts module/tenant selectors or exposes platform repositories to a module. */
export function moduleInstanceReads<T>(
  execution: ModuleExecution,
  view: (row: ModuleInstance) => ConfiguredInstance<T>,
): ModuleInstanceReads<T> {
  async function get(key: string) {
    execution.tx.assertActive();
    return activeInstance(execution.tx, execution.moduleType, instanceKeySchema.parse(key));
  }
  async function historical(instance: ModuleInstance, version: number) {
    const revision = await execution.tx.repositories.revisions.get(
      instance.id,
      instanceVersionSchema.parse(version),
    );
    return view({
      ...instance,
      config: revision.config,
      moduleVersion: revision.moduleVersion,
      configVersion: revision.configVersion,
    });
  }
  return Object.freeze({
    async get(key) {
      return view(await get(key));
    },
    async revision(key, version) {
      return historical(await get(key), version);
    },
    async revisionById(id, version) {
      execution.tx.assertActive();
      const instance = await execution.tx.repositories.instances.get(id);
      if (instance.moduleType !== execution.moduleType) throw new AppError('not_found');
      return historical(instance, version);
    },
    async revisions(key, page) {
      const instance = await get(key);
      const rows = await execution.tx.repositories.revisions.list(instance.id, page);
      return rows.map((revision) =>
        Object.assign({}, revision, {
          config: view({
            ...instance,
            config: revision.config,
            moduleVersion: revision.moduleVersion,
            configVersion: revision.configVersion,
          }).config,
        }),
      );
    },
  });
}
