import { defineModuleCatalog } from '@backbricks/core';
import { formsModule } from '@backbricks/module-forms';
import { reviewsDescriptor } from '@backbricks/module-reviews';
import { uploadsModule } from '@backbricks/module-uploads';

/** Uploads and forms are operational; reviews remains a descriptor until M4. */
export const moduleCatalog = defineModuleCatalog([uploadsModule, formsModule, reviewsDescriptor]);
export const availableModules = moduleCatalog.available;
