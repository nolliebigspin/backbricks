import { z } from 'zod';

/** Preset identifiers are part of persisted zone configs, not labels shown to site owners. */
export const UPLOAD_PRESETS = { images: 'images', pdf: 'pdf', office: 'office' } as const;
/** Config accepts named presets rather than arbitrary MIME strings or user-provided regexes. */
export const uploadPresetSchema = z.enum(UPLOAD_PRESETS);
export type UploadPreset = z.infer<typeof uploadPresetSchema>;

/** MIME/extension pairs, not separate lists that could accidentally permit their cross-product. */
export const UPLOAD_FORMATS = [
  { preset: UPLOAD_PRESETS.images, mime: 'image/png', extensions: ['png'] },
  { preset: UPLOAD_PRESETS.images, mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  { preset: UPLOAD_PRESETS.images, mime: 'image/webp', extensions: ['webp'] },
  { preset: UPLOAD_PRESETS.images, mime: 'image/gif', extensions: ['gif'] },
  { preset: UPLOAD_PRESETS.pdf, mime: 'application/pdf', extensions: ['pdf'] },
  {
    preset: UPLOAD_PRESETS.office,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    mainPart: 'word/document.xml',
  },
  {
    preset: UPLOAD_PRESETS.office,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    mainPart: 'xl/workbook.xml',
  },
  {
    preset: UPLOAD_PRESETS.office,
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['pptx'],
    mainPart: 'ppt/presentation.xml',
  },
] as const satisfies readonly {
  preset: UploadPreset;
  mime: string;
  extensions: readonly string[];
  mainPart?: string;
}[];

/** Normalize MIME case before checking the shared allowlist and its associated extension pair. */
export const uploadMimeSchema = z
  .string()
  .toLowerCase()
  .pipe(z.enum(UPLOAD_FORMATS.map((format) => format.mime)));

/** MIME names are normalized, but the original private filename is retained for downloads. */
export function uploadExtension(name: string): string {
  return name.slice(name.lastIndexOf('.') + 1).toLowerCase();
}
