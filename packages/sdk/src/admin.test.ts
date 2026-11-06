import { expect, test } from 'bun:test';

import { createAdminClient, type AdminClient } from './admin.ts';

function compileOnly(client: AdminClient) {
  // @ts-expect-error Project routes require their generated path selector.
  void client.GET('/v1/projects/{projectId}');
  // @ts-expect-error Unknown operations cannot bypass the generated API contract.
  void client.GET('/v1/not-an-operation');
  // @ts-expect-error Project names are strings in the source contract.
  void client.POST('/v1/projects', { body: { name: 42, slug: 'fixture' } });
}
void compileOnly;

test('the admin client applies request options and preserves typed structured errors over HTTP', async () => {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      expect(request.headers.get('authorization')).toBe('Bearer fixture-credential');
      expect(new URL(request.url).pathname).toBe('/v1/projects/prj_fixture');
      return Response.json(
        {
          type: 'https://errors.backbricks.dev/not_found',
          title: 'Not found',
          status: 404,
          code: 'not_found',
          requestId: 'req_fixture',
        },
        { status: 404 },
      );
    },
  });
  try {
    const client = createAdminClient({
      baseUrl: server.url.origin,
      headers: { authorization: 'Bearer fixture-credential' },
    });
    const result = await client.GET('/v1/projects/{projectId}', {
      params: { path: { projectId: 'prj_fixture' } },
    });
    expect(result.data).toBeUndefined();
    expect(result.error?.code).toBe('not_found');
    expect(result.response.status).toBe(404);
    const child = Bun.spawn(
      [
        'node',
        '--input-type=module',
        '-e',
        'import { createAdminClient } from "@backbricks/sdk/admin"; const result = await createAdminClient({baseUrl: process.argv[1], headers:{authorization:"Bearer fixture-credential"}}).GET("/v1/projects/{projectId}", {params:{path:{projectId:"prj_fixture"}}}); if (result.error.code !== "not_found") process.exit(1);',
        server.url.origin,
      ],
      {
        cwd: new URL('../', import.meta.url).pathname,
        env: { ...process.env },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const exited = await child.exited;
    expect({ exited, stderr: await new Response(child.stderr).text() }).toEqual({
      exited: 0,
      stderr: '',
    });
  } finally {
    await server.stop();
  }
});
