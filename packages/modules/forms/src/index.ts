import { defineModuleDescriptor, type InfraRequirement } from '@backbricks/core';

/** Forms needs nothing besides Postgres (ARCHITECTURE §C.7). The full definition arrives in its domain milestone. */
export const formsInfrastructure = [] as const satisfies readonly InfraRequirement[];

/** M1 descriptor only; the domain milestone supplies the operational definition. */
export const formsDescriptor = defineModuleDescriptor({
  type: 'forms',
  displayName: { en: 'Forms', de: 'Formulare' },
  resourceName: { singular: 'form', plural: 'forms' },
  infrastructure: formsInfrastructure,
});
