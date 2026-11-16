import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  AppError,
  storagePutSchema,
  storageUploadControlSchema,
  storageUploadCompleteSchema,
  type Clock,
  type StorageAdapter,
  type StorageConfig,
} from '@backbricks/core';

import { isMissing, unavailable, STORAGE_IO_TIMEOUTS } from './s3-io.ts';

const options = () => ({ abortSignal: AbortSignal.timeout(STORAGE_IO_TIMEOUTS.metadataMs) });

/** One browser PUT, with object creation reserved to the server. Handles are never returned separately from the opaque signed URL. */
export function createS3UploadSessions(
  internal: S3Client,
  signing: S3Client,
  config: StorageConfig,
  clock: Clock,
): Pick<StorageAdapter, 'createUploadSession' | 'completeUpload' | 'abortUpload'> {
  return {
    async createUploadSession(input) {
      const data = storagePutSchema.parse(input);
      const created = await internal
        .send(
          new CreateMultipartUploadCommand({
            Bucket: config.bucket,
            Key: data.key,
            ContentType: data.contentType,
          }),
          options(),
        )
        .catch(unavailable);
      if (!created.UploadId) return unavailable();
      const handle = created.UploadId;
      try {
        const headers = { 'content-length': String(data.size), 'content-type': data.contentType };
        const command = new UploadPartCommand({
          Bucket: config.bucket,
          Key: data.key,
          UploadId: handle,
          PartNumber: 1,
          ContentLength: data.size,
        });
        // UploadPart has no ContentType input, but the browser header must still be signed exactly.
        command.middlewareStack.add(
          (next) => async (args) => {
            const request = args.request;
            if (
              typeof request !== 'object' ||
              !request ||
              !('headers' in request) ||
              typeof request.headers !== 'object' ||
              !request.headers
            )
              return unavailable();
            Reflect.set(request.headers, 'content-type', data.contentType);
            return next(args);
          },
          { step: 'build', name: 'backbricksUploadContentType' },
        );
        const url = await getSignedUrl(signing, command, {
          expiresIn: data.expiresInSeconds,
          signingDate: clock.now(),
          signableHeaders: new Set(Object.keys(headers)),
          unhoistableHeaders: new Set(Object.keys(headers)),
        }).catch(unavailable);
        return { url, headers, handle };
      } catch (error) {
        await internal
          .send(
            new AbortMultipartUploadCommand({
              Bucket: config.bucket,
              Key: data.key,
              UploadId: handle,
            }),
            options(),
          )
          .catch(() => undefined);
        throw error;
      }
    },
    async completeUpload(input) {
      const data = storageUploadCompleteSchema.parse(input);
      const identity = { Bucket: config.bucket, Key: data.key, UploadId: data.handle };
      const result = await internal
        .send(new ListPartsCommand({ ...identity, MaxParts: 2 }), options())
        .catch(unavailable);
      const part = result.Parts?.[0];
      if (
        result.IsTruncated ||
        result.Parts?.length !== 1 ||
        part?.PartNumber !== 1 ||
        part.Size !== data.size ||
        !part.ETag
      )
        throw new AppError('validation_failed');
      await internal
        .send(
          new CompleteMultipartUploadCommand({
            ...identity,
            MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
          }),
          options(),
        )
        .catch(unavailable);
    },
    async abortUpload(input) {
      const data = storageUploadControlSchema.parse(input);
      const identity = { Bucket: config.bucket, Key: data.key, UploadId: data.handle };
      try {
        await internal.send(new AbortMultipartUploadCommand(identity), options());
      } catch (error) {
        if (!isMissing(error)) unavailable();
      }
      try {
        await internal.send(new ListPartsCommand({ ...identity, MaxParts: 1 }), options());
      } catch (error) {
        if (isMissing(error)) return;
        unavailable();
      }
      // Some providers need repeated aborts while an in-flight part settles. Keep the durable identity.
      unavailable();
    },
  };
}
