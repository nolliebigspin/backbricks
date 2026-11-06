import type { AvailableModules } from '@backbricks/core';
import { formsInfrastructure } from '@backbricks/module-forms';
import { reviewsInfrastructure } from '@backbricks/module-reviews';
import { uploadsInfrastructure } from '@backbricks/module-uploads';

/**
 * The modules this image ships, in registry order (ARCHITECTURE §C.2). `BACKBRICKS_MODULES`
 * picks the enabled subset. P1.6 replaces this with `defineRegistry` over full definitions.
 */
export const availableModules: AvailableModules = {
  uploads: uploadsInfrastructure,
  forms: formsInfrastructure,
  reviews: reviewsInfrastructure,
};
