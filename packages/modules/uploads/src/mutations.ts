import {
  AppError,
  bulkIdsSchema,
  fileIdSchema,
  inlineImageTypeSchema,
  principalActor,
  type ModuleAdminRouter,
} from '@backbricks/core';
import { z } from 'zod';

import { UPLOAD_AUDIT_ACTIONS, UPLOAD_DOWNLOAD_LIMITS, UPLOAD_LIFETIMES } from './constants.ts';
import { requestFileDeletion } from './deletion.ts';
import { uploadManagementPolicy } from './policies.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';
import { isUsableFile } from './usability.ts';

const params = z.object({ id: fileIdSchema }).strict();
export const downloadUrlSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() }).strict();
/** Private downloads and durable revocation share the host's parent-first mutation transaction. */
export function uploadsMutationRoutes(router: ModuleAdminRouter<UploadsRuntime>) {
  router.register(
    {
      method: 'POST',
      resource: 'files',
      path: '/{id}/download-url',
      operationId: 'uploads.files.download',
      input: z.object({
        params,
        query: z.object({}).strict(),
        body: z.object({ preview: z.boolean().default(false) }).strict(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'Audited short-lived private file URL.',
          schema: downloadUrlSchema,
        },
      },
      policy: { ...uploadManagementPolicy('files.download'), rateLimit: UPLOAD_DOWNLOAD_LIMITS },
    },
    async (runtime, { params: path, body }) => {
      const now = runtime.services.clock.now();
      const file = await uploadsRepository(runtime).get(path.id, now, { lock: true });
      if (!isUsableFile(file, now)) throw new AppError('not_found');
      const image = inlineImageTypeSchema.safeParse(file.detectedMime);
      if (body.preview && !image.success)
        throw new AppError('validation_failed', {
          detail: 'Preview is available only for supported images.',
        });
      const storage = runtime.services.require('storage');
      const object = await storage.head(file.storageKey);
      if (!object) throw new AppError('not_found');
      if (object.size !== file.sizeBytes) throw new AppError('service_unavailable');
      const signingAt = runtime.services.clock.now();
      const ttl = Math.min(
        UPLOAD_LIFETIMES.downloadSeconds,
        file.expiresAt
          ? Math.floor((file.expiresAt.getTime() - signingAt.getTime()) / 1000)
          : UPLOAD_LIFETIMES.downloadSeconds,
      );
      if (ttl < 1) throw new AppError('not_found');

      const url = await storage.presignGet({
        key: file.storageKey,
        downloadName: file.originalName,
        expiresInSeconds: ttl,
        ...(file.expiresAt ? { notAfter: file.expiresAt } : {}),
        ...(body.preview && image.success ? { inlineImageType: image.data } : {}),
      });
      const principal = runtime.tx.context.principal;
      if (!principal) throw new AppError('forbidden');
      await runtime.services.audit.record(runtime.tx, {
        ...principalActor(principal),
        action: UPLOAD_AUDIT_ACTIONS.downloaded,
        targetType: 'file',
        targetId: file.id,
        changes: { reason: body.preview ? 'preview' : 'download' },
      });
      return Response.json(
        downloadUrlSchema.parse({
          url,
          expiresAt: new Date(signingAt.getTime() + ttl * 1000).toISOString(),
        }),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    },
  );
  router.register(
    {
      method: 'DELETE',
      resource: 'files',
      path: '/{id}',
      operationId: 'uploads.files.delete',
      input: z.object({ params, query: z.object({}).strict(), body: z.null() }),
      responses: {
        204: { kind: 'empty', description: 'Access revoked; durable object cleanup scheduled.' },
      },
      policy: uploadManagementPolicy('files.delete', 'data:delete'),
    },
    async (runtime, { params: path }) => {
      const file = await uploadsRepository(runtime).get(path.id, runtime.services.clock.now(), {
        lock: true,
      });
      await requestFileDeletion(runtime, file);
      return new Response(null, { status: 204 });
    },
  );
  router.register(
    {
      method: 'POST',
      resource: 'files',
      path: '/bulk-delete',
      operationId: 'uploads.files.bulk_delete',
      input: z.object({
        params: z.object({}).strict(),
        query: z.object({}).strict(),
        body: z
          .object({
            ids: bulkIdsSchema.refine((ids) =>
              ids.every((id) => fileIdSchema.safeParse(id).success),
            ),
          })
          .strict(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'All selected files revoked atomically.',
          schema: z.object({ count: z.number().int().nonnegative() }).strict(),
        },
      },
      policy: uploadManagementPolicy('files.bulk_delete', 'data:delete', 'admin', 8192),
    },
    async (runtime, { body }) => {
      const rows = await uploadsRepository(runtime).lockMany(
        body.ids,
        runtime.services.clock.now(),
      );
      for (const file of rows) {
        // oxlint-disable-next-line no-await-in-loop -- Validate/lock the complete set before durable deletion intent.
        await requestFileDeletion(runtime, file);
      }
      return Response.json({ count: rows.length });
    },
  );
}
