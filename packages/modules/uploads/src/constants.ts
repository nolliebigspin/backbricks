import { FILE_SIZE_LIMITS } from '@backbricks/core';

/** One zone's accepted size and public declaration envelope, independent of transport/provider. */
export const UPLOAD_LIMITS = {
  ...FILE_SIZE_LIMITS,
  defaultSizeMb: 10,
  bodyBytes: 4 * 1024,
} as const;
/** First persisted config format; core parses version 1 directly, with no invented legacy migration. */
export const UPLOADS_MODULE_VERSION = 1;

/** Security lifetimes are independent of a zone's configurable owned-file retention. */
export const UPLOAD_LIFETIMES = { putSeconds: 300, orphanMs: 24 * 60 * 60 * 1000 } as const;
export const UPLOAD_JOBS = { scan: 'uploads.scan' } as const;
export const UPLOAD_METRICS = { bytes: 'uploads.bytes', files: 'uploads.files' } as const;

export const UPLOAD_CREATE_SCOPE = 'uploads:create';
