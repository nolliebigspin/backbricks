/** Public credential protocol prefixes; secret tokens must never enter metadata or logs. */
export const API_KEY_PREFIXES = { publishable: 'bb_pk_', secret: 'bb_sk_' } as const;
