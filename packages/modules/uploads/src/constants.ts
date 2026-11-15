/** One zone's accepted size and public declaration envelope, independent of transport/provider. */
export const UPLOAD_LIMITS = {
  maxSizeMb: 100,
  bytesPerMb: 1024 * 1024,
  defaultSizeMb: 10,
  bodyBytes: 4 * 1024,
} as const;
/** First persisted config format; core parses version 1 directly, with no invented legacy migration. */
export const UPLOADS_MODULE_VERSION = 1;
