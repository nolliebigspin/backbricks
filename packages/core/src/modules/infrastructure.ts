/**
 * Infrastructure a module needs besides Postgres (ARCHITECTURE §C.7, ADR-0019). The core
 * derives the required configuration and readiness checks from the enabled modules'
 * declarations, so e.g. object storage is only required when a module stores files.
 */
export type InfraService = 'storage' | 'scanner';

export type InfraRequirement = {
  readonly service: InfraService;
  /** The module also works without it (e.g. uploads with `SCANNER=none`). */
  readonly optional?: boolean;
};

/** Modules an installation ships, by module type, with their infrastructure declarations. */
export type AvailableModules = Readonly<Record<string, readonly InfraRequirement[]>>;

/** The services the given modules need, with `optional` only if every declaration is optional. */
export function requiredInfrastructure(
  modules: AvailableModules,
  enabled: readonly string[],
): Map<InfraService, { optional: boolean }> {
  const services = new Map<InfraService, { optional: boolean }>();
  for (const type of enabled) {
    for (const requirement of modules[type] ?? []) {
      const optional = requirement.optional === true;
      const current = services.get(requirement.service);
      services.set(requirement.service, { optional: (current?.optional ?? true) && optional });
    }
  }
  return services;
}
