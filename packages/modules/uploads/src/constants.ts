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
export const UPLOAD_JOBS = { scan: 'uploads.scan', cleanup: 'uploads.cleanup-file' } as const;
export const UPLOAD_METRICS = { bytes: 'uploads.bytes', files: 'uploads.files' } as const;

export const UPLOAD_CREATE_SCOPE = 'uploads:create';

/** Bounded format metadata, independent of the accepted file byte limit. */
export const UPLOAD_INSPECTION = {
  tokenizerBytes: 1024 * 1024,
  contentTypesBytes: 64 * 1024,
  zipEntries: 10_000,
  timeoutMs: 30_000,
} as const;

export const UPLOAD_EVENTS = {
  ready: { name: 'uploads.file.ready', description: { en: 'File ready', de: 'Datei bereit' } },
  quarantined: {
    name: 'uploads.file.quarantined',
    description: { en: 'File quarantined', de: 'Datei in Quarantäne' },
  },
  rejected: {
    name: 'uploads.file.rejected',
    description: { en: 'File rejected', de: 'Datei abgelehnt' },
  },
} as const;
export const UPLOAD_RETRIES = {
  scanAttempts: 3,
  scanDelaysMs: [5000, 30_000],
  cleanupDelayMs: 30_000,
} as const;
