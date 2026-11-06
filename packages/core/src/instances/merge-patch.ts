import type { JsonValue } from '../modules/values.ts';

/** RFC 7396: objects merge, null removes a member, arrays/scalars replace the whole value. */
export function mergeConfigPatch(target: JsonValue, patch: JsonValue): JsonValue {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const members = new Map(
    Object.entries(
      target !== null && typeof target === 'object' && !Array.isArray(target) ? target : {},
    ),
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) members.delete(key);
    else members.set(key, mergeConfigPatch(members.get(key) ?? null, value));
  }
  // Object.fromEntries creates own data properties even for __proto__/constructor.
  return Object.fromEntries(members);
}
