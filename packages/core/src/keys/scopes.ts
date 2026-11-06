import { z } from 'zod';

/** The v1 scope catalog. Module-dependent rights are unavailable when that module is disabled. */
export const KEY_SCOPES = [
  { name: 'integration:read', module: null },
  { name: 'config:read', module: null },
  { name: 'config:write', module: null },
  { name: 'config:destructive', module: null },
  { name: 'project:write', module: null },
  { name: 'test:write', module: null },
  { name: 'stats:read', module: null },
  { name: 'forms:submit', module: 'forms' },
  { name: 'uploads:create', module: 'uploads' },
  { name: 'reviews:submit', module: 'reviews' },
  { name: 'data:read', module: null },
  { name: 'data:write', module: null },
  { name: 'data:delete', module: null },
] as const;
export const keyScopeSchema = z.enum(KEY_SCOPES.map((entry) => entry.name));
export type KeyScope = z.infer<typeof keyScopeSchema>;

/** Named grants are data, never wildcard expansion or implication between scopes. */
export const KEY_SCOPE_PRESETS = {
  agent: ['integration:read', 'config:read', 'config:write', 'test:write', 'stats:read'],
  server_integration: ['forms:submit', 'uploads:create', 'reviews:submit'],
  data_access: ['stats:read', 'data:read', 'data:write'],
} as const satisfies Record<string, readonly KeyScope[]>;
export const keyPresetSchema = z.enum(
  Object.keys(KEY_SCOPE_PRESETS).filter((value): value is keyof typeof KEY_SCOPE_PRESETS =>
    Object.hasOwn(KEY_SCOPE_PRESETS, value),
  ),
);

/** Creation and authentication both use this enabled-module-aware boundary. Unknown rights fail. */
export function keyScopesSchema(enabledModules: readonly string[]) {
  const enabled = new Set(enabledModules);
  return z
    .array(keyScopeSchema)
    .max(KEY_SCOPES.length)
    .refine(
      (scopes) =>
        scopes.every((name) => {
          const entry = KEY_SCOPES.find((scope) => scope.name === name);
          return entry && (entry.module === null || enabled.has(entry.module));
        }),
      { message: 'A requested scope requires a disabled module.' },
    )
    .transform((scopes) => [...new Set(scopes)].toSorted());
}

/** Presets list their effective enabled rights; an empty preset cannot create a useful secret key. */
export function keyPresetScopes(
  preset: keyof typeof KEY_SCOPE_PRESETS,
  enabledModules: readonly string[],
): KeyScope[] {
  const enabled = new Set(
    KEY_SCOPES.filter(
      (entry) => entry.module === null || enabledModules.includes(entry.module),
    ).map((entry) => entry.name),
  );
  return KEY_SCOPE_PRESETS[preset].filter((scope) => enabled.has(scope)).toSorted();
}
