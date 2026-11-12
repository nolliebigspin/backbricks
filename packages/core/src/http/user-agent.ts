/** Coarse browser families; enough to spot bots and debug, too coarse to fingerprint (I11). */
export const USER_AGENT_FAMILIES = [
  'bot',
  'edge',
  'opera',
  'firefox',
  'chrome',
  'safari',
  'other',
] as const;
export type UserAgentFamily = (typeof USER_AGENT_FAMILIES)[number];

// Order matters: Edge and Opera also send "Chrome", Chrome also sends "Safari".
const RULES: readonly [UserAgentFamily, RegExp][] = [
  ['bot', /bot|crawler|spider|curl|wget|python|httpclient|headless/i],
  ['edge', /edg(e|a|ios)?\//i],
  ['opera', /opr\/|opera/i],
  ['firefox', /firefox\/|fxios\//i],
  ['chrome', /chrome\/|crios\//i],
  ['safari', /safari\//i],
];

/** Reduce a User-Agent header to its family; the header itself is never stored. */
export function userAgentFamily(header: string | null | undefined): UserAgentFamily {
  if (!header) return 'other';
  const value = header.slice(0, 512);
  return RULES.find(([, pattern]) => pattern.test(value))?.[0] ?? 'other';
}

/** The page path from a Referer header, without query or fragment (they can carry personal data). */
export function refererPath(header: string | null | undefined): string | null {
  if (!header || !URL.canParse(header)) return null;
  const url = new URL(header);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.pathname.slice(0, 512) : null;
}
