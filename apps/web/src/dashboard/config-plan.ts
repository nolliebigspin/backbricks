import { admin } from '../auth/client.ts';
import { unwrap } from './feedback.tsx';
import type { useModuleScope } from './module-scope.ts';

/** Ask the one server classifier; optimistic versions prevent a stale preview being saved. */
export async function instanceConfigIsDestructive(
  scope: ReturnType<typeof useModuleScope>,
  resource: string,
  key: string,
  version: number,
  config: Record<string, unknown>,
) {
  const path = { projectId: scope.projectId };
  const document = unwrap(
    await admin.GET('/v1/projects/{projectId}/config', {
      params: { path },
      headers: scope.headers,
    }),
  );
  const instances = document.modules[resource] ?? {};
  const current = instances[key];
  if (current?.configVersion !== version)
    throw Object.assign(new Error('Stale configuration'), { code: 'conflict' });
  const plan = unwrap(
    await admin.PUT('/v1/projects/{projectId}/config', {
      params: { path, query: { dryRun: 'true' } },
      headers: scope.headers,
      body: {
        config: {
          ...document,
          modules: { [resource]: { ...instances, [key]: { ...current, config } } },
        },
      },
    }),
  );
  if (!('planHash' in plan)) throw new Error('Expected a configuration plan.');
  return plan.changes.some(
    (change) => change.resource === resource && change.key === key && change.destructive,
  );
}
