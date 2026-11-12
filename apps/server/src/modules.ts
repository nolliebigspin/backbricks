import { defineModuleCatalog } from '@backbricks/core';
import { formsModule } from '@backbricks/module-forms';
import { reviewsDescriptor } from '@backbricks/module-reviews';
import { uploadsDescriptor } from '@backbricks/module-uploads';

/** Forms is operational (M2); uploads and reviews stay descriptors until M3/M4. */
export const moduleCatalog = defineModuleCatalog([
  uploadsDescriptor,
  formsModule,
  reviewsDescriptor,
]);
export const availableModules = moduleCatalog.available;
