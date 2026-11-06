import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  AppError,
  storagePutSchema,
  storageGetSchema,
  storageKeySchema,
  storageObjectSchema,
  systemClock,
  type Clock,
  type StorageAdapter,
  type StorageConfig,
} from '@backbricks/core';

function unavailable(): never {
  throw new AppError('service_unavailable', { detail: 'Object storage is unavailable.' });
}
function isMissing(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
function disposition(inline: boolean, name = 'download') {
  const encoded = encodeURIComponent(name).replaceAll(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`;
}

/** Private S3 port. Signing uses the public endpoint; all server-side I/O uses the internal endpoint. */
export function createS3Storage(config: StorageConfig, clock: Clock = systemClock) {
  const options = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
    maxAttempts: 2,
  };
  const internal = new S3Client({ ...options, endpoint: config.endpoint });
  const signing = new S3Client({ ...options, endpoint: config.publicEndpoint ?? config.endpoint });
  const adapter: StorageAdapter = {
    async presignPut(input) {
      const data = storagePutSchema.parse(input);
      const headers = { 'content-length': String(data.size), 'content-type': data.contentType };
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: data.key,
        ContentType: data.contentType,
        ContentLength: data.size,
      });
      const url = await getSignedUrl(signing, command, {
        expiresIn: data.expiresInSeconds,
        signingDate: clock.now(),
        signableHeaders: new Set(Object.keys(headers)),
        unhoistableHeaders: new Set(Object.keys(headers)),
      }).catch(unavailable);
      return { url, headers };
    },
    async presignGet(input) {
      const data = storageGetSchema.parse(input);
      return getSignedUrl(
        signing,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: data.key,
          ResponseContentType: data.inlineImageType ?? 'application/octet-stream',
          ResponseContentDisposition: disposition(
            data.inlineImageType !== undefined,
            data.downloadName,
          ),
        }),
        { expiresIn: data.expiresInSeconds, signingDate: clock.now() },
      ).catch(unavailable);
    },
    async head(key) {
      storageKeySchema.parse(key);
      try {
        const value = await internal.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return storageObjectSchema.parse({
          size: value.ContentLength,
          contentType: value.ContentType ?? null,
        });
      } catch (error) {
        if (isMissing(error)) return null;
        return unavailable();
      }
    },
    async copy(source, target) {
      storageKeySchema.parse(source);
      storageKeySchema.parse(target);
      await internal
        .send(
          new CopyObjectCommand({
            Bucket: config.bucket,
            Key: target,
            CopySource: `${encodeURIComponent(config.bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`,
          }),
        )
        .catch(unavailable);
    },
    async delete(key) {
      storageKeySchema.parse(key);
      await internal
        .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
        .catch(unavailable);
    },
    async read(key) {
      storageKeySchema.parse(key);
      const result = await internal
        .send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
        .catch(unavailable);
      if (!result.Body) return unavailable();
      return result.Body.transformToWebStream();
    },
  };
  return {
    ...adapter,
    async check() {
      await internal.send(new HeadBucketCommand({ Bucket: config.bucket })).catch(unavailable);
    },
    close() {
      internal.destroy();
      signing.destroy();
    },
  };
}
