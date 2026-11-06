import type { ServiceContainer } from '../services/container.ts';
import type { TenantHandle, TenantTransaction } from '../tenancy/tenant-context.ts';
import type { CapabilityLookup } from './capabilities.ts';

/** Framework-only frame; callbacks receive a restricted ModuleRuntime instead. */
export type ModuleExecution = {
  moduleType: string;
  tx: TenantTransaction;
  handle: TenantHandle;
  services: ServiceContainer;
  capability: CapabilityLookup;
};
