import {
  AppError,
  fileIdSchema,
  fileReferenceSchema,
  hashApiKey,
  instanceKeySchema,
  uploadTokenSchema,
  type ModulePublicRouter,
} from '@backbricks/core';
import { z } from 'zod';

import {
  UPLOAD_CREATE_SCOPE,
  UPLOAD_LIFETIMES,
  UPLOAD_LIMITS,
  UPLOAD_JOBS,
  UPLOAD_METRICS,
} from './constants.ts';
import { uploadDeclarationSchema } from './declaration.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';
import { createUploadToken, verifyUploadToken } from './tokens.ts';
import { validateUploadDeclaration } from './validation.ts';
import { uploadStatusSchema } from './values.ts';

export const uploadIntentSchema = uploadDeclarationSchema.extend({
  metadata: z
    .record(z.string().max(64), z.string().max(256))
    .refine((value) => Object.keys(value).length <= 10)
    .optional(),
});
export const uploadIntentResponseSchema = z
  .object({
    fileId: fileIdSchema,
    uploadUrl: z.url(),
    headers: z.record(z.string(), z.string()),
    uploadToken: uploadTokenSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const uploadCompleteResponseSchema = z
  .object({ fileId: fileIdSchema, fileRef: fileReferenceSchema, status: uploadStatusSchema })
  .strict();

/** Public uploads use the shared abuse guard; intent responses must never enter its acknowledgement cache. */
export function uploadsPublicRoutes(router: ModulePublicRouter<UploadsRuntime>): void {
  router.register(
    {
      method: 'POST',
      path: '/{key}/files',
      operationId: 'uploads.public.intent',
      input: z.object({
        params: z.object({ key: instanceKeySchema }).strict(),
        query: z.object({}).strict(),
        body: uploadIntentSchema,
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'Private upload intent.',
          schema: uploadIntentResponseSchema,
        },
      },
      policy: { kind: 'public', bodyLimitBytes: UPLOAD_LIMITS.bodyBytes },
      access: {
        kind: 'write',
        secretScope: UPLOAD_CREATE_SCOPE,
        quota: { metric: UPLOAD_METRICS.bytes, amountField: 'size' },
      },
    },
    async (runtime, input) => {
      const context = runtime.publicWrite;
      if (!context) throw new AppError('internal_error');
      const config = runtime.config(context.config);
      validateUploadDeclaration(config, {
        name: input.body.name,
        size: input.body.size,
        type: input.body.type,
      });
      if (config.scanRequired && !runtime.services.optional('scanner'))
        throw new AppError('capability_unavailable');
      const now = runtime.services.clock.now();
      const fileId = runtime.services.ids.generate('file');
      const token = createUploadToken();
      const { organizationId, projectId } = runtime.tx.context;
      if (!projectId) throw new AppError('internal_error');
      const stagingKey = `stg/${organizationId}/${projectId}/${fileId}`;
      const expiresAt = new Date(now.getTime() + UPLOAD_LIFETIMES.putSeconds * 1000);
      const signed = await runtime.services.require('storage').createUploadSession({
        key: stagingKey,
        contentType: input.body.type,
        size: input.body.size,
        expiresInSeconds: UPLOAD_LIFETIMES.putSeconds,
      });
      try {
        await uploadsRepository(runtime).insert({
          id: fileId,
          instanceId: context.instanceId,
          configVersion: context.configVersion,
          stagingKey,
          storageKey: `fil/${organizationId}/${projectId}/${fileId}`,
          originalName: input.body.name,
          declaredMime: input.body.type,
          sizeBytes: input.body.size,
          uploadTokenHash: await hashApiKey(token),
          uploadExpiresAt: expiresAt,
          uploadHandle: signed.handle,
          metadata: input.body.metadata ?? {},
          isTest: false,
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + UPLOAD_LIFETIMES.orphanMs),
        });
        await runtime.services.usage.increment(runtime.tx, {
          metric: UPLOAD_METRICS.bytes,
          delta: BigInt(input.body.size),
        });
        await runtime.services.usage.increment(runtime.tx, {
          metric: UPLOAD_METRICS.files,
          delta: 1n,
        });
        return Response.json(
          uploadIntentResponseSchema.parse({
            fileId,
            uploadUrl: signed.url,
            headers: signed.headers,
            uploadToken: token,
            expiresAt: expiresAt.toISOString(),
          }),
        );
      } catch (error) {
        await runtime.services
          .require('storage')
          .abortUpload({ key: stagingKey, handle: signed.handle })
          .catch(() => undefined);
        throw error;
      }
    },
  );
  router.register(
    {
      method: 'POST',
      resource: 'files',
      path: '/{fileId}/complete',
      operationId: 'uploads.public.complete',
      input: z.object({
        params: z.object({ fileId: fileIdSchema }).strict(),
        query: z.object({}).strict(),
        body: z.object({ uploadToken: uploadTokenSchema }).strict(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'Caller-owned upload state.',
          schema: uploadCompleteResponseSchema,
        },
      },
      policy: { kind: 'public', bodyLimitBytes: UPLOAD_LIMITS.bodyBytes },
      access: { kind: 'write', secretScope: UPLOAD_CREATE_SCOPE },
      resolveInstance: async (context, input) => {
        const repository = uploadsRepository(context);
        const file = await repository.get(input.params.fileId, context.clock.now());
        await verifyUploadToken(file.uploadTokenHash, input.body.uploadToken);
        return repository.resolveZoneKey(file.id, context.clock.now());
      },
    },
    async (runtime, input) => {
      const context = runtime.publicWrite;
      if (!context) throw new AppError('internal_error');
      const repository = uploadsRepository(runtime);
      const now = runtime.services.clock.now();
      let file = await repository.get(input.params.fileId, now, { lock: true });
      await verifyUploadToken(file.uploadTokenHash, input.body.uploadToken);
      if (file.instanceId !== context.instanceId) throw new AppError('not_found');
      if (file.status === 'pending') {
        const config = runtime.config(context.config);
        if (file.uploadExpiresAt <= now) throw new AppError('not_found');
        if (file.configVersion !== context.configVersion) throw new AppError('conflict');
        validateUploadDeclaration(config, {
          name: file.originalName,
          type: file.declaredMime,
          size: file.sizeBytes,
        });
        if (config.scanRequired && !runtime.services.optional('scanner'))
          throw new AppError('capability_unavailable');
        const storage = runtime.services.require('storage');
        let head = await storage.head(file.stagingKey);
        if (!head && file.uploadHandle) {
          await storage.completeUpload({
            key: file.stagingKey,
            handle: file.uploadHandle,
            size: file.sizeBytes,
          });
          head = await storage.head(file.stagingKey);
        }
        if (!head || head.size !== file.sizeBytes || head.contentType !== file.declaredMime)
          throw new AppError('validation_failed');
        const queue = runtime.services.optional('queue');
        if (!queue) throw new AppError('service_unavailable');
        file = await repository.patch(file.id, {
          status: 'uploaded',
          uploadedAt: now,
          updatedAt: now,
        });
        await queue.enqueue(
          runtime.tx,
          UPLOAD_JOBS.scan,
          { fileId: file.id },
          { singletonKey: file.id },
        );
      }
      return Response.json(
        uploadCompleteResponseSchema.parse({
          fileId: file.id,
          fileRef: `${file.id}.${input.body.uploadToken}`,
          status: file.status,
        }),
      );
    },
  );
}
