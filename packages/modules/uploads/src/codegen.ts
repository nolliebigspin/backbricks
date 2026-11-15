import { sdkSchemaDeclaration, type ConfiguredInstance } from '@backbricks/core';

import type { UploadsConfig } from './config.ts';
import { UPLOAD_FORMATS } from './formats.ts';

/** One zone's declared upload shape; only its key and allowlisted MIME literals enter generated code. */
export function uploadsCodegen(instance: ConfiguredInstance<UploadsConfig>): string {
  const mime = UPLOAD_FORMATS.filter((format) => instance.config.presets.includes(format.preset))
    .map((format) => JSON.stringify(format.mime))
    .join(' | ');
  return sdkSchemaDeclaration(
    'upload-zones',
    instance.key,
    `{\n      name: string;\n      size: number;\n      type: ${mime};\n    }`,
  );
}
