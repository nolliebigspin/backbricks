import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uploadIntentResponseSchema } from '@backbricks/module-uploads';
import { BackbricksError, createClient } from '@backbricks/sdk';

import { attachmentsEnvironment, prepareAttachments } from '../test/attachments-fixture.ts';
import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { createReviewFixture, reviewAnswers } from '../test/reviews-fixture.ts';
import { uploadsAvailable } from '../test/uploads-fixture.ts';

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

test.skipIf(!uploadsAvailable)(
  'the SDK uploads and claims real private files on Bun and Node without replaying PUTs',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        const directory = await mkdtemp(join(tmpdir(), 'backbricks-upload-sdk-'));
        const bytes = '%PDF-1.7\nSDK runtime acceptance\n%%EOF';
        try {
          const phases: string[] = [];
          let puts = 0;
          const client = createClient({
            baseUrl: f.origin,
            publishableKey: f.publishable.token,
            fetch: async (url, init) => {
              if (init.method === 'PUT') puts += 1;
              const response = await fetch(url, init);
              if (new URL(url).pathname.endsWith('/upload-zones/cv/files') && response.ok) {
                const result = uploadIntentResponseSchema.parse(await response.clone().json());
                await f.trackIntent(result);
              }
              return response;
            },
          });
          const uploaded = await client.uploads.upload(
            'cv',
            new File([bytes], 'bun.pdf', { type: 'application/pdf' }),
            {
              onProgress: (event) => {
                phases.push(event.phase);
                expect(event.loaded).toBeLessThanOrEqual(event.total);
              },
            },
          );
          expect(uploaded.status).toBe('ready');
          expect(phases).toContain('processing');
          expect(phases.at(-1)).toBe('ready');
          expect(puts).toBe(1);
          const submission = await client.forms.submit(f.form.key, {
            email: 'sdk@example.test',
            cv: [uploaded.fileRef],
          });
          if (!('id' in submission)) throw new Error('Expected a stored SDK submission.');
          const record = await f.use(async (tx) =>
            tx.modules.uploads?.get(uploaded.fileId, f.now()),
          );
          expect(record?.ownerId).toBe(submission.id);
          if (!record) throw new Error('Expected the owned SDK file.');
          expect(await new Response(await f.storage.read(record.storageKey)).text()).toBe(bytes);
          const sdk = await bundleForNode(directory);
          const child = Bun.spawn(
            [
              'node',
              '--input-type=module',
              '-e',
              `
          const {createClient}=await import(process.argv[1]);
          let puts=0; const phases=[];
          const client=createClient({baseUrl:process.argv[2],secretKey:process.argv[3],fetch:async(url,init)=>{
            if(init.method==='PUT') puts++;
            const response=await fetch(url,init);
            if(new URL(url).pathname.endsWith('/upload-zones/cv/files') && response.ok) console.log((await response.clone().json()).fileId);
            return response;
          }});
          const result=await client.uploads.upload('cv',new File([process.argv[4]],'node.pdf',{type:'application/pdf'}),{onProgress:(event)=>phases.push(event.phase)});
          if(result.status!=='ready'||puts!==1||!phases.includes('processing')||phases.at(-1)!=='ready') process.exit(2);
        `,
              sdk,
              f.origin,
              f.secret.token,
              bytes,
            ],
            { stdout: 'pipe', stderr: 'pipe' },
          );
          const [exited, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          for (const id of stdout.trim().split('\n').filter(Boolean)) {
            // oxlint-disable-next-line no-await-in-loop -- Track each real session/object even when a child assertion fails.
            await f.trackIntent({ fileId: id });
          }
          expect({ exited, stderr }).toEqual({ exited: 0, stderr: '' });
          expect(stdout.trim()).toMatch(/^file_/);
        } finally {
          await f.cleanup();
          await rm(directory, { recursive: true, force: true });
        }
      },
      attachmentsEnvironment,
      { durableDelivery: true },
    );
  },
  120_000,
);

test.skipIf(!available)(
  'the Reviews SDK submits, lists and reads stats against the same contract on Bun and Node',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f);
        const client = createClient({ baseUrl: f.origin, publishableKey: r.publishable.token });
        const receipt = await client.reviews.submit(r.collection.key, reviewAnswers);
        if (!('id' in receipt)) throw new Error('Expected a review receipt.');
        expect((await r.moderate(receipt.id, 'approve')).status).toBe(200);
        expect((await r.moderate(receipt.id, 'publish')).status).toBe(200);
        expect(
          (await client.reviews.list(r.collection.key, { limit: 1, sort: 'rating_asc' })).data[0]
            ?.id,
        ).toBe(receipt.id);
        expect((await client.reviews.stats(r.collection.key)).count).toBe(1);
        const directory = await mkdtemp(join(tmpdir(), 'backbricks-review-sdk-'));
        try {
          const sdk = await bundleForNode(directory);
          const child = Bun.spawn(
            [
              'node',
              '--input-type=module',
              '-e',
              `const { createClient } = await import(process.argv[1]);
           const [baseUrl, publishableKey, key] = process.argv.slice(2);
           const { reviews } = createClient({baseUrl, publishableKey});
           const { id } = await reviews.submit(key, JSON.parse(process.argv[5]));
           const page = await reviews.list(key, { sort: 'rating_desc', limit: 1 });
           const stats = await reviews.stats(key);
           if (!/^rev_/.test(id) || page.data.length !== 1 || stats.count !== 1) process.exit(2);`,
              sdk,
              f.origin,
              r.publishable.token,
              r.collection.key,
              JSON.stringify(reviewAnswers),
            ],
            { stdout: 'pipe', stderr: 'pipe' },
          );
          expect({
            exited: await child.exited,
            stderr: await new Response(child.stderr).text(),
          }).toEqual({ exited: 0, stderr: '' });
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      },
      { BACKBRICKS_MODULES: 'reviews' },
    );
  },
  45_000,
);
