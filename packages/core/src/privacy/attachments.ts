import { z } from 'zod';

import { MAX_PAGE_SIZE, pageQuerySchema } from '../http/pagination.ts';
import { fileAttachmentSchema } from '../storage/file-metadata.ts';

export const subjectFileAvailabilitySchema = z.enum([
  'ready',
  'not_ready',
  'expired',
  'deleted',
  'missing',
  'unavailable',
]);
export const subjectAttachmentSchema = fileAttachmentSchema.extend({
  availability: subjectFileAvailabilitySchema,
});
export const subjectAttachmentPageSchema = z
  .object({
    data: z.array(subjectAttachmentSchema).max(MAX_PAGE_SIZE),
    nextCursor: pageQuerySchema.shape.cursor.unwrap().nullable(),
  })
  .strict()
  .refine((page) => !page.nextCursor || page.data.length === MAX_PAGE_SIZE);
export const subjectAttachmentSourceSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      stream: z.custom<ReadableStream<Uint8Array>>((value) => value instanceof ReadableStream),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      reason: subjectFileAvailabilitySchema.exclude(['ready']),
    })
    .strict(),
]);
export type SubjectAttachment = z.infer<typeof subjectAttachmentSchema>;
export type SubjectAttachmentPage = z.infer<typeof subjectAttachmentPageSchema>;
export type SubjectAttachmentSource = z.infer<typeof subjectAttachmentSourceSchema>;
