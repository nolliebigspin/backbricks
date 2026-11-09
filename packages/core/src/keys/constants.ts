/** Public credential protocol prefixes; secret tokens must never enter metadata or logs. */
export const API_KEY_PREFIXES = { publishable: 'bb_pk_', secret: 'bb_sk_' } as const;

export const API_KEY_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const API_KEY_TOKEN_LENGTH = 32;

/** A grant list must also fit its transactional audit/event metadata. */
export const MAX_KEY_SCOPES = 100;
