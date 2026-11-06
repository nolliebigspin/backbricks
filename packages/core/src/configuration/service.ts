import { AppError } from '../errors/app-error.ts';
import { MAX_PAGE_SIZE } from '../http/pagination.ts';
import { requireConfigAccess } from '../instances/permissions.ts';
import { validatedConfig, type InstanceDependencies } from '../instances/persistence.ts';
import type { ModuleInstance } from '../platform/models.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import { configDigest, configPlanTokens } from './plan-token.ts';
import { planConfiguration } from './planner.ts';
import {
  CONFIG_SCHEMA_ID,
  CONFIG_PLAN_TTL_MS,
  configChangeSchema,
  configDocumentSchema,
  type ConfigDocument,
} from './schemas.ts';

async function allInstances(tx: TenantTransaction) {
  const rows: ModuleInstance[] = [];
  let before: { createdAt: Date; id: string } | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Each bounded page follows the preceding keyset cursor.
    const page = await tx.repositories.instances.list({ limit: MAX_PAGE_SIZE, before });
    rows.push(...page);
    const last = page.at(-1);
    if (page.length < MAX_PAGE_SIZE || !last) return rows;
    before = last;
  }
}

async function state(tx: TenantTransaction) {
  requireConfigAccess(tx, 'read');
  if (!tx.context.projectId) throw new AppError('not_found');
  await tx.repositories.projects.get(tx.context.projectId);
  return allInstances(tx);
}
/** Read-only exports and principal/state/schema-bound plans; applying a plan is a separate write boundary. */
export function createConfigurationService(deps: InstanceDependencies & { appSecret: string }) {
  const tokens = configPlanTokens(deps.appSecret);
  return {
    async read(tx: TenantTransaction): Promise<ConfigDocument> {
      const rows = await state(tx);
      const modules: ConfigDocument['modules'] = {};
      for (const module of deps.registry.modules) {
        modules[module.resourceName.plural] = Object.fromEntries(
          rows
            .filter((row) => row.moduleType === module.type && row.status !== 'archived')
            .map((row) => [
              row.key,
              {
                name: row.name,
                status: row.status === 'paused' ? 'paused' : 'active',
                configVersion: row.configVersion,
                moduleVersion: module.moduleVersion,
                config: validatedConfig(module, row.config, row.moduleVersion),
              },
            ]),
        );
      }
      return configDocumentSchema.parse({
        $schema: CONFIG_SCHEMA_ID,
        project: tx.context.projectId,
        modules,
      });
    },
    async plan(tx: TenantTransaction, input: unknown) {
      const rows = await state(tx);
      const plan = planConfiguration(deps.registry, input, rows);
      if (plan.document.project !== tx.context.projectId) throw new AppError('not_found');
      const digest = configDigest({
        organization: tx.context.organizationId,
        project: tx.context.projectId,
        principal: tx.context.principal,
        desired: plan.document,
        current: rows.map((row) => ({
          id: row.id,
          configVersion: row.configVersion,
          moduleVersion: row.moduleVersion,
          status: row.status,
        })),
        registry: deps.registry.modules.map((module) => ({
          type: module.type,
          version: module.moduleVersion,
          schema: module.configJsonSchema,
        })),
      });
      const expiresAt = deps.clock.now().getTime() + CONFIG_PLAN_TTL_MS;
      return {
        changes: plan.operations.map((operation) => configChangeSchema.strip().parse(operation)),
        warnings: plan.warnings,
        destructive: plan.destructive,
        planHash: tokens.issue(digest, expiresAt),
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },
  };
}
export type ConfigurationService = ReturnType<typeof createConfigurationService>;
