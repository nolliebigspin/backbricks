import { z } from 'zod';

import { UPLOAD_LIMITS } from './constants.ts';
import { uploadMimeSchema } from './formats.ts';
import { uploadFilenameSchema } from './values.ts';

/** The client declaration binds signed PUT headers; it is never proof of the actual stored type. */
export const uploadDeclarationSchema = z
  .object({
    name: uploadFilenameSchema,
    size: z
      .number()
      .int()
      .positive()
      .max(UPLOAD_LIMITS.maxSizeMb * UPLOAD_LIMITS.bytesPerMb),
    type: uploadMimeSchema,
  })
  .strict();
export type UploadDeclaration = z.infer<typeof uploadDeclarationSchema>;
