import { expect } from 'bun:test';

import { defineModuleCatalog, instanceResponseSchema } from '@backbricks/core';
import { createFormsModule } from '@backbricks/module-forms';
import { uploadCompleteResponseSchema, uploadsModule } from '@backbricks/module-uploads';

import type { AuthFixture } from './auth-fixture.ts';
import { prepareUploads, uploadsEnvironment } from './uploads-fixture.ts';

/** Explicit composition for testing the transaction-bound attachment seam. */
export const attachmentsCatalog = defineModuleCatalog([
  uploadsModule,
  createFormsModule({ files: true }),
]);
export const attachmentsEnvironment = {
  ...uploadsEnvironment,
  BACKBRICKS_MODULES: 'forms,uploads',
};
export async function prepareAttachments(base: AuthFixture) {
  const f = await prepareUploads(base, { limits: { perMinute: 100, perHour: 1000 } }, [
    'forms',
    'uploads',
  ]);
  const createForm = async (key = 'attachments', zone = 'cv') => {
    const response = await f.request(
      `/v1/projects/${f.a1.id}/forms`,
      {
        key,
        name: 'Attachments',
        config: {
          fields: [
            {
              key: 'email',
              type: 'email',
              label: 'Email',
              required: true,
              identifiesSubject: true,
            },
            { key: 'cv', type: 'file', label: 'CV', zone, maxFiles: 2 },
          ],
          retentionDays: 7,
          limits: { perMinute: 100, perHour: 1000 },
        },
      },
      f.owner.cookie,
    );
    expect(response.status).toBe(201);
    return instanceResponseSchema.parse(await response.json());
  };
  const form = await createForm();
  return {
    ...f,
    form,
    createForm,
    submit(refs: readonly string[], key = form.key, email = 'Person@Example.test') {
      return f.request(
        `/v1/public/forms/${key}/submissions`,
        { data: { email, cv: refs } },
        undefined,
        f.headers,
      );
    },
    async ready(name = 'cv.pdf') {
      const file = await f.intent(name);
      await f.put(file);
      expect((await f.complete(file)).status).toBe(200);
      const scan = f.jobs().find((job) => job.name === 'uploads.scan');
      if (!scan) throw new Error('Missing scan handler.');
      await scan.run(f.scope, { fileId: file.fileId });
      const complete = uploadCompleteResponseSchema.parse(await (await f.complete(file)).json());
      expect(complete.status).toBe('ready');
      return { ...file, fileRef: complete.fileRef };
    },
  };
}
