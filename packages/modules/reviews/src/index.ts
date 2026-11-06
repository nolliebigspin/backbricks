import { defineModuleDescriptor, type InfraRequirement } from '@backbricks/core';

/** Reviews needs nothing besides Postgres (ARCHITECTURE §C.7). The full definition arrives in its domain milestone. */
export const reviewsInfrastructure = [] as const satisfies readonly InfraRequirement[];

/** M1 descriptor only; the domain milestone supplies the operational definition. */
export const reviewsDescriptor = defineModuleDescriptor({
  type: 'reviews',
  displayName: { en: 'Reviews', de: 'Bewertungen' },
  resourceName: { singular: 'review-collection', plural: 'review-collections' },
  infrastructure: reviewsInfrastructure,
});
