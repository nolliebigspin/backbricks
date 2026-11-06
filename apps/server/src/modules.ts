import { defineModuleCatalog } from '@backbricks/core';
import { formsDescriptor } from '@backbricks/module-forms';
import { reviewsDescriptor } from '@backbricks/module-reviews';
import { uploadsDescriptor } from '@backbricks/module-uploads';

/** Domain descriptors remain non-operational until their own milestone supplies a full definition. */
export const moduleCatalog = defineModuleCatalog([
  uploadsDescriptor,
  formsDescriptor,
  reviewsDescriptor,
]);
export const availableModules = moduleCatalog.available;
