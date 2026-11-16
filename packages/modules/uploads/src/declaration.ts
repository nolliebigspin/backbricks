import { fileSizeSchema } from '@backbricks/core';
import { z } from 'zod';

import { uploadMimeSchema } from './formats.ts';
import { uploadFilenameSchema } from './values.ts';

/** The client declaration binds signed PUT headers; it is never proof of the actual stored type. */
export const uploadDeclarationSchema = z
  .object({
    name: uploadFilenameSchema,
    size: fileSizeSchema,
    type: uploadMimeSchema,
  })
  .strict();
export type UploadDeclaration = z.infer<typeof uploadDeclarationSchema>;
