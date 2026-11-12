import type { PublicReadContext, PublicWriteContext } from '../abuse/policy.ts';
import type { ServiceContainer } from '../services/container.ts';
import type { TenantHandle, TenantTransaction } from '../tenancy/tenant-context.ts';
import type { CapabilityLookup } from './capabilities.ts';
import type { ModuleStreamPage } from './streams.ts';

/** Framework-only frame; callbacks receive a restricted ModuleRuntime instead. */
export type ModuleExecution = {
  moduleType: string;
  tx: TenantTransaction;
  handle: TenantHandle;
  services: ServiceContainer;
  capability: CapabilityLookup;
  publicRead?: Readonly<PublicReadContext>;
  publicWrite?: Readonly<PublicWriteContext>;
  readStream?: (
    read: (execution: ModuleExecution, cursor: string | undefined) => Promise<ModuleStreamPage>,
    prefix: string,
  ) => ReadableStream<Uint8Array>;
};
