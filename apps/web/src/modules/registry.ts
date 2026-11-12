/**
 * Static dashboard module registry (ARCHITECTURE §C.2), parallel to the server's module list. An
 * entry shows up only when `/v1/meta` reports its module as operational, so disabled modules
 * contribute no navigation.
 */
export const dashboardModules = [{ type: 'forms', labelKey: 'forms.inbox' }] as const;

export type ModuleAvailability = { type: string; resourceName: { plural: string } };

/** Project navigation for the operational modules; pages live under the module's plural name. */
export function moduleNavigation(projectId: string, operational: readonly ModuleAvailability[]) {
  return dashboardModules.flatMap((entry) => {
    const module = operational.find((candidate) => candidate.type === entry.type);
    return module
      ? [
          {
            type: entry.type,
            labelKey: entry.labelKey,
            href: `/projects/${encodeURIComponent(projectId)}/${module.resourceName.plural}`,
          },
        ]
      : [];
  });
}
