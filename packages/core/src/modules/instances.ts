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
  return Object.freeze({
    async get(key) {
      return view(await get(key));
    },
    async revision(key, version) {
      const instance = await get(key);
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
    },
  });
}
