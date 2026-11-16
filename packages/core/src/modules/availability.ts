import { AppError } from '../errors/app-error.ts';
import { MAX_MAINTENANCE_BATCH } from '../jobs/contract.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { ModuleRegistry } from './registry.ts';

/** Disabled persisted modules must not silently disappear from privacy operations. */
export async function requireEnabledProjectModules(
  tx: TenantTransaction,
  registry: ModuleRegistry,
) {
  let before: { id: string; createdAt: Date } | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Inspect every bounded configuration page before removing any data.
    const page = await tx.repositories.instances.list(
      { limit: MAX_MAINTENANCE_BATCH, before },
      undefined,
      { includeArchived: true },
    );
    if (page.some((instance) => !registry.get(instance.moduleType)))
      throw new AppError('capability_unavailable', {
        detail:
          'Enable all modules used by this project before accessing or erasing its personal data.',
      });
    if (page.length < MAX_MAINTENANCE_BATCH) return;
    const last = page.at(-1);
    if (!last) return;
    before = { id: last.id, createdAt: last.createdAt };
  }
}
