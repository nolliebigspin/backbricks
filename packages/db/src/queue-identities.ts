import { createHash } from 'node:crypto';

/** Stable namespace/identity tuple without delimiter collisions or readable personal fields. */
export function queueSingletonId(parts: readonly string[]) {
  const hex = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
