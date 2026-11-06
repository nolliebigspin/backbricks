import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import { usageIncrementSchema, type UsageIncrement } from './usage.ts';

export type EntitlementDecision = Readonly<{
  allowed: boolean;
  limit: bigint | null;
  remaining: bigint | null;
}>;
/** Finite implementations must enforce concurrent quota changes within this supplied transaction. */
export interface Entitlements {
  check(tx: TenantTransaction, input: UsageIncrement): Promise<EntitlementDecision>;
}

/** Self-hosted policy has no limits. Null represents unlimited without unsafe numeric infinity. */
export function createUnlimitedEntitlements(): Entitlements {
  return {
    check(_tx, input) {
      usageIncrementSchema.parse(input);
      return Promise.resolve({ allowed: true, limit: null, remaining: null });
    },
  };
}
