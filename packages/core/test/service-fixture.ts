import {
  createAuditService,
  createEventService,
  createIds,
  createRateLimiter,
  createServiceContainer,
  createUnlimitedEntitlements,
  createUsageService,
  type OptionalServices,
} from '../src/index.ts';

export const testClock = { now: () => new Date('2026-11-06T00:00:00Z') };
export function createTestCoreServices() {
  const common = { clock: testClock, ids: createIds(testClock) };
  return {
    ...common,
    audit: createAuditService(common),
    events: createEventService(common),
    usage: createUsageService(testClock),
    entitlements: createUnlimitedEntitlements(),
    rateLimiter: createRateLimiter({ increment: async () => 1 }, testClock),
  };
}
export function createTestContainer(providers: Partial<OptionalServices> = {}) {
  return createServiceContainer(createTestCoreServices(), providers);
}
