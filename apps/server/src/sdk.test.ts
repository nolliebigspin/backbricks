import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BackbricksError, createClient } from '@backbricks/sdk';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

/** The SDK's root entry bundled for Node, as a website build would ship it. */
async function bundleForNode(directory: string) {
  const result = await Bun.build({
    entrypoints: [Bun.resolveSync('@backbricks/sdk', import.meta.dir)],
    outdir: directory,
    target: 'node',
    format: 'esm',
    naming: 'sdk.js',
  });
  if (!result.success) throw new AggregateError(result.logs, 'SDK bundle failed');
  return join(directory, 'sdk.js');
}

test.skipIf(!available)(
  'the SDK submits through the real server on Bun and Node (proof-of-work, errors, secret keys)',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key, publishable } = await createFormFixture(f);
      const baseUrl = `${f.origin}/v1`;

      // Bun: the SDK fetches and solves a real challenge; the server stores the entry.
      const client = createClient({ publishableKey: publishable, baseUrl });
      const accepted = await client.forms.submit(key, validAnswers);
      expect(accepted).toEqual({ id: expect.stringMatching(/^sub_/) });

      // Validation problems arrive as field errors, never with the submitted values.
      const invalid = await client.forms
        .submit(key, { ...validAnswers, email: 'secret-not-an-email' })
        .catch((cause: unknown) => cause);
      expect(invalid).toBeInstanceOf(BackbricksError);
      expect(invalid).toMatchObject({
        code: 'validation_failed',
        status: 422,
        requestId: expect.stringMatching(/^req_/),
        fieldErrors: [{ path: 'email', code: 'invalid_email' }],
      });
      expect(JSON.stringify(invalid)).not.toContain('secret-not-an-email');

      // Server-to-server with a scoped secret key: no proof needed.
      const secret = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'SDK server',
        scopes: ['forms:submit'],
        expiresAt: null,
      });
      const server = createClient({ secretKey: secret.token, baseUrl });
      expect(await server.forms.submit(key, validAnswers)).toEqual({
        id: expect.stringMatching(/^sub_/),
      });

      // Node (the version on PATH; CI uses mise's Node 24, the Node 20 probe swaps PATH).
      const directory = await mkdtemp(join(tmpdir(), 'backbricks-sdk-'));
      try {
        const sdk = await bundleForNode(directory);
        const child = Bun.spawn(
          [
            'node',
            '--input-type=module',
            '-e',
            `const { createClient } = await import(process.argv[1]);
             const client = createClient({ publishableKey: process.argv[2], baseUrl: process.argv[3] });
             const result = await client.forms.submit(process.argv[4], JSON.parse(process.argv[5]));
             if (!/^sub_/.test(result.id)) process.exit(2);`,
            sdk,
            publishable,
            baseUrl,
            key,
            JSON.stringify(validAnswers),
          ],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        const exited = await child.exited;
        expect({ exited, stderr: await new Response(child.stderr).text() }).toEqual({
          exited: 0,
          stderr: '',
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  },
  120_000,
);
