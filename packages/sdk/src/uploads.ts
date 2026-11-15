import type { operations } from '@backbricks/api-contract';

import { BackbricksError, unexpectedResponse } from './errors.ts';
import { publicProof } from './proof.ts';
import type { Transport } from './transport.ts';
import { putUpload, type UploadProgress } from './upload-put.ts';

type Intent = Extract<
  operations['uploads.public.intent']['responses'][200]['content']['application/json'],
  { fileId: string }
>;
type Completion = Extract<
  operations['uploads.public.complete']['responses'][200]['content']['application/json'],
  { fileId: string }
>;
export type UploadResult = Completion & { status: 'ready' };
export type UploadDeclaration<
  Schema,
  Key extends string,
> = `upload-zones/${Key}` extends keyof Schema
  ? Schema[`upload-zones/${Key}`]
  : { name: string; size: number; type: string };
export type UploadOptions = {
  /** Required for a Blob without a File name. */ name?: string;
  /** Override an empty or generic Blob MIME type with the declared type. */ type?: string;
  metadata?: Record<string, unknown>;
  honeypot?: string;
  signal?: AbortSignal;
  /** Deadline for the entire operation, including proof and readiness (default 120 seconds; maximum 30 minutes). */ timeoutMs?: number;
  onProgress?: (event: UploadProgress) => void;
};
export type UploadsClient<Schema> = {
  /** Upload once, wait for inspection, then return the temporary reference to claim in a form. */
  upload<Key extends string>(
    zone: Key,
    file: Blob,
    options?: UploadOptions &
      Partial<
        Pick<
          UploadDeclaration<Schema, Key>,
          Extract<keyof UploadDeclaration<Schema, Key>, 'name' | 'type'>
        >
      >,
  ): Promise<UploadResult>;
};
const POLL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
function rejectDropped(value: unknown) {
  if (typeof value === 'object' && value !== null && 'accepted' in value && value.accepted === true)
    throw new BackbricksError({
      code: 'upload_not_accepted',
      status: 200,
      message: 'The upload was not accepted.',
    });
}
function isIntent(value: unknown): value is Intent {
  if (typeof value !== 'object' || value === null) return false;
  if (
    !(
      'fileId' in value &&
      typeof value.fileId === 'string' &&
      'uploadToken' in value &&
      typeof value.uploadToken === 'string' &&
      'uploadUrl' in value &&
      typeof value.uploadUrl === 'string' &&
      'headers' in value &&
      typeof value.headers === 'object' &&
      value.headers !== null &&
      !Array.isArray(value.headers)
    )
  )
    return false;
  try {
    const url = new URL(value.uploadUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
  } catch {
    return false;
  }
  return Object.values(value.headers).every((header) => typeof header === 'string');
}
function isCompletion(value: unknown): value is Completion {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fileId' in value &&
    typeof value.fileId === 'string' &&
    'fileRef' in value &&
    typeof value.fileRef === 'string' &&
    'status' in value &&
    ['pending', 'uploaded', 'scanning', 'ready', 'quarantined', 'rejected'].includes(
      String(value.status),
    )
  );
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, POLL_MS);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}
export function createUploads<Schema>(transport: Transport): UploadsClient<Schema> {
  return {
    async upload(zone, file, options = {}) {
      options.signal?.throwIfAborted();
      if (!(file instanceof Blob)) throw new TypeError('Upload a File or Blob.');
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
        throw new TypeError(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}.`);
      const name =
        options.name ?? ('name' in file && typeof file.name === 'string' ? file.name : undefined);
      if (!name) throw new TypeError('Provide the upload file name.');
      const controller = new AbortController();
      const { signal } = controller;
      const aborted = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', aborted, { once: true });
      if (options.signal?.aborted) aborted();
      const timer = setTimeout(
        () =>
          controller.abort(
            new BackbricksError({
              code: 'upload_timeout',
              status: 408,
              message: 'The upload did not become ready before the deadline.',
            }),
          ),
        timeoutMs,
      );
      try {
        signal.throwIfAborted();
        const proof = await publicProof(transport, signal);
        const intent = await transport.request(
          `/public/upload-zones/${encodeURIComponent(zone)}/files`,
          {
            method: 'POST',
            body: {
              data: {
                name,
                size: file.size,
                type: options.type ?? file.type,
                metadata: options.metadata,
              },
              proof,
              honeypot: options.honeypot,
            },
          },
          signal,
        );
        rejectDropped(intent);
        if (!isIntent(intent)) throw unexpectedResponse();
        await putUpload(
          intent.uploadUrl,
          intent.headers,
          file,
          signal,
          transport.send,
          options.onProgress,
          transport.nativeProgress,
        );
        options.onProgress?.({ phase: 'processing', loaded: file.size, total: file.size });
        for (;;) {
          signal.throwIfAborted();
          // oxlint-disable-next-line no-await-in-loop -- Every completion needs a fresh single-use proof.
          const completionProof = await publicProof(transport, signal);
          // oxlint-disable-next-line no-await-in-loop -- Poll only completion; never replay intent or provider PUT.
          const result = await transport.request(
            `/public/files/${encodeURIComponent(intent.fileId)}/complete`,
            {
              method: 'POST',
              body: { data: { uploadToken: intent.uploadToken }, proof: completionProof },
            },
            signal,
          );
          rejectDropped(result);
          if (!isCompletion(result) || result.fileId !== intent.fileId) throw unexpectedResponse();
          if (result.status === 'ready') {
            options.onProgress?.({ phase: 'ready', loaded: file.size, total: file.size });
            return { ...result, status: 'ready' };
          }
          if (result.status === 'quarantined' || result.status === 'rejected')
            throw new BackbricksError({
              code: `upload_${result.status}`,
              status: 422,
              message:
                result.status === 'quarantined'
                  ? 'The file was blocked by the safety check.'
                  : 'The file did not meet the upload rules.',
            });
          // oxlint-disable-next-line no-await-in-loop -- Readiness waits are cancellable and bounded by the operation deadline.
          await pause(signal);
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        throw error;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', aborted);
      }
    },
  };
}
