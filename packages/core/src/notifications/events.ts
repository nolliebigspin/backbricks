import type { ModuleRegistry } from '../modules/registry.ts';

/** Email rules can subscribe to events with a module-owned delivery description. */
export function notificationEvents(registry: ModuleRegistry) {
  return registry.modules.flatMap((module) =>
    module.notifications ? module.events.map((event) => ({ event, module })) : [],
  );
}
