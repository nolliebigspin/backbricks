import type { localizedNameSchema } from '@backbricks/core';
import type { z } from 'zod';

import { uploadsConfigSchema, type UploadsConfig, type UploadsConfigInput } from './config.ts';
import { UPLOAD_PRESETS } from './formats.ts';

const SOURCES = {
  images: { name: { en: 'Images', de: 'Bilder' }, config: { presets: [UPLOAD_PRESETS.images] } },
  documents: {
    name: { en: 'Documents', de: 'Dokumente' },
    config: { presets: [UPLOAD_PRESETS.pdf, UPLOAD_PRESETS.office] },
  },
  cv: {
    name: { en: 'CV (PDF)', de: 'Lebenslauf (PDF)' },
    config: { presets: [UPLOAD_PRESETS.pdf], maxSizeMb: 5 },
  },
} satisfies Record<
  string,
  { name: z.infer<typeof localizedNameSchema>; config: UploadsConfigInput }
>;
export type UploadTemplateName = keyof typeof SOURCES;

/** Protected templates are always available; unscanned variants require an explicit named choice. */
export function uploadsTemplates(options: { includeUnscanned?: boolean } = {}) {
  const result: Record<string, { name: string; config: UploadsConfig }> = {};
  for (const [key, source] of Object.entries(SOURCES))
    for (const language of ['en', 'de'] as const) {
      result[`${key}-${language}`] = {
        name: source.name[language],
        config: uploadsConfigSchema.parse(source.config),
      };
      if (options.includeUnscanned)
        result[`${key}-unscanned-${language}`] = {
          name: `${source.name[language]} (${language === 'en' ? 'without malware scanning' : 'ohne Virenprüfung'})`,
          config: uploadsConfigSchema.parse({ ...source.config, scanRequired: false }),
        };
    }
  return result;
}

/** A default never silently opts out of scanning, including on installations without a scanner. */
export function defaultUploadsConfig(): UploadsConfig {
  return uploadsConfigSchema.parse(SOURCES.images.config);
}
