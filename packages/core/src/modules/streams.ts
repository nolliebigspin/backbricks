import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';

const pageSchema = z
  .object({ text: z.string(), nextCursor: z.string().max(1024).nullable() })
  .strict();
export type ModuleStreamPage = z.infer<typeof pageSchema>;

/** One page per pull, with bounded prefetch and cancellation; the host owns each read transaction. */
export function createPagedTextStream(
  read: (cursor: string | undefined) => Promise<ModuleStreamPage>,
  prefix: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor: string | undefined,
    finished = false,
    header = true;
  return new ReadableStream({
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }
      if (header) {
        header = false;
        if (prefix) {
          controller.enqueue(encoder.encode(prefix));
          return;
        }
      }
      try {
        const page = pageSchema.parse(await read(cursor));
        if (finished) return;
        if (page.nextCursor !== null && page.nextCursor === cursor)
          throw new AppError('internal_error');
        finished = page.nextCursor === null;
        cursor = page.nextCursor ?? undefined;
        if (page.text) controller.enqueue(encoder.encode(page.text));
        if (finished) controller.close();
      } catch (error) {
        finished = true;
        controller.error(error);
      }
    },
    cancel() {
      finished = true;
    },
  });
}
