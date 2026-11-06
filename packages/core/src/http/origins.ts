import { z } from 'zod';

/** Exact HTTP(S) origins only; normalization never turns an arbitrary URL into an origin. */
export const httpOriginSchema = z
  .string()
  .max(2048)
  .regex(/^https?:\/\/[^/?#\\\s@]+\/?$/i)
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.username || url.password || url.hostname.includes('*')) throw new Error();
      return url.origin;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Expected an HTTP(S) origin.' });
      return z.NEVER;
    }
  });

export const MAX_ALLOWED_ORIGINS = 100;
/** Empty means all valid origins, as documented for public CORS; it grants no authentication. */
export const allowedOriginsSchema = z
  .array(httpOriginSchema)
  .max(MAX_ALLOWED_ORIGINS)
  .transform((origins) => [...new Set(origins)].toSorted());

/** Exact canonical equality, including scheme and non-default port; never suffix matching. */
export function isOriginAllowed(allowedOrigins: readonly string[], origin: string): boolean {
  const parsed = httpOriginSchema.safeParse(origin);
  return parsed.success && (allowedOrigins.length === 0 || allowedOrigins.includes(parsed.data));
}
