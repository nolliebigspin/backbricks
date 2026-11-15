import { defineModuleCatalog } from '@backbricks/core';
import { createFormsModule } from '@backbricks/module-forms';
import { reviewsDescriptor } from '@backbricks/module-reviews';
import { uploadsModule } from '@backbricks/module-uploads';

function catalog(files: boolean) {
  return defineModuleCatalog([uploadsModule, createFormsModule({ files }), reviewsDescriptor]);
}
const base = catalog(false);
const withFiles = catalog(true);
/** Composition derives optional field availability from selected capability providers. */
export const moduleCatalog = Object.freeze({
  ...base,
  select(enabled: readonly string[]) {
    const selected = base.select(enabled);
    return selected.registry.modules.some((module) => module.provides.includes('files'))
      ? withFiles.select(enabled)
      : selected;
  },
});
export const availableModules = moduleCatalog.available;
