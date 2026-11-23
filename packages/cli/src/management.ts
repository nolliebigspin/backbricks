import { createAdminClient, type AdminOperations } from '@backbricks/sdk/admin';

import { CliError, exit, safeLabel } from './errors.ts';
import { asRecord } from './local-files.ts';
import { readSecret, type Target } from './target.ts';

export type ConfigInput =
  AdminOperations['planProjectConfig']['requestBody']['content']['application/json']['config'];
export type Integration =
  AdminOperations['getProjectIntegration']['responses'][200]['content']['application/json'];

export async function management(target: Target, credential?: string) {
  const secret = credential ?? (await readSecret(target));
  return createAdminClient({
    baseUrl: target.baseUrl,
    credentials: 'omit',
    redirect: 'error',
    headers: { Authorization: `Bearer ${secret}` },
    fetch: async (request) => {
      try {
        return await fetch(request, { signal: AbortSignal.timeout(15_000) });
      } catch {
        throw new CliError(
          'network_error',
          'Could not reach the configured Backbricks API.',
          exit.remote,
        );
      }
    },
  });
}

export function responseData<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  const problem = asRecord(result.error);
  const requestId = safeLabel(
    problem?.['requestId'] ?? result.response.headers.get('x-request-id'),
  );
  const code = safeLabel(problem?.['code']) ?? 'api_error';
  const fields = Array.isArray(problem?.['errors'])
    ? problem['errors'].flatMap((value: unknown) => {
        const field = asRecord(value);
        const path = safeLabel(field?.['path']);
        return path ? [{ path, code: safeLabel(field?.['code']) }] : [];
      })
    : [];
  throw new CliError(
    code,
    `Backbricks API rejected the request (HTTP ${result.response.status}).`,
    exit.remote,
    {
      status: result.response.status,
      requestId,
      fields,
    },
  );
}

export const scope = (target: Target) => ({ path: { projectId: target.project } });

export async function integration(target: Target, secret?: string): Promise<Integration> {
  const api = await management(target, secret);
  const result = responseData(
    await api.GET('/v1/projects/{projectId}/integration', { params: scope(target) }),
  );
  if (result.project.id !== target.project)
    throw new CliError('wrong_project', 'The API returned a different project.', exit.remote);
  return result;
}

export async function projectTypes(target: Target) {
  const api = await management(target);
  return responseData(
    await api.GET('/v1/projects/{projectId}/types', {
      params: scope(target),
      parseAs: 'text',
    }),
  );
}

export async function testSubmit(
  target: Target,
  key: string,
  data: Record<string, unknown>,
  channel: 'cli' | 'mcp' = 'cli',
) {
  const api = await management(target);
  const params = { path: { projectId: target.project, key } };
  return channel === 'mcp'
    ? responseData(
        await api.POST('/v1/projects/{projectId}/forms/{key}/mcp-test-submissions', {
          params,
          body: data,
        }),
      )
    : responseData(
        await api.POST('/v1/projects/{projectId}/forms/{key}/test-submissions', {
          params,
          body: data,
        }),
      );
}

export async function listKeys(target: Target, cursor?: string) {
  const api = await management(target);
  return responseData(
    await api.GET('/v1/projects/{projectId}/keys', {
      params: { ...scope(target), query: { cursor } },
    }),
  );
}
