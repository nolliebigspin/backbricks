import { defineModule, fileIdSchema } from '@backbricks/core';
import { z } from 'zod';

import { uploadsAdminRoutes } from './admin.ts';
import { filesCapability } from './capability.ts';
import { classifyUploadsChange } from './changes.ts';
import { cleanupUpload } from './cleanup.ts';
import { uploadsCodegen } from './codegen.ts';
import { uploadsConfigSchema, uploadsPublicWritePolicy } from './config.ts';
import {
  UPLOAD_CREATE_SCOPE,
  UPLOADS_MODULE_VERSION,
  UPLOAD_JOBS,
  UPLOAD_METRICS,
  UPLOAD_EVENTS,
} from './constants.ts';
import { uploadsInfrastructure } from './infrastructure.ts';
import { maintainUploads } from './maintenance.ts';
import { uploadsMutationRoutes } from './mutations.ts';
import { describeUpload } from './notifications.ts';
import { eraseUploadScope } from './privacy.ts';
import { uploadsPublicRoutes } from './public.ts';
import { uploadsRepository } from './runtime.ts';
import { scanUpload } from './scan.ts';
import {
  exportUploadSubject,
  deleteUploadSubject,
  pendingUploadErasure,
  uploadSubjectAttachments,
} from './subject.ts';
import { defaultUploadsConfig, uploadsTemplates } from './templates.ts';

const label = { en: 'Uploads', de: 'Dateien' };
/** Operational upload zones; protected defaults remain protected even with SCANNER=none. */
export const uploadsModule = defineModule({
  type: 'uploads',
  moduleVersion: UPLOADS_MODULE_VERSION,
  displayName: label,
  resourceName: { singular: 'upload-zone', plural: 'upload-zones' },
  resourceNamespaces: ['files', 'storage-usage'],
  infrastructure: uploadsInfrastructure,
  services: { optional: ['queue'] },
  configSchema: uploadsConfigSchema,
  defaultConfig: defaultUploadsConfig,
  templates: uploadsTemplates({ includeUnscanned: true }),
  validateConfigChange: classifyUploadsChange,
  codegen: uploadsCodegen,
  publicWritePolicy: uploadsPublicWritePolicy,
  scopes: [
    {
      name: UPLOAD_CREATE_SCOPE,
      description: { en: 'Create uploads from a server', de: 'Dateien vom Server hochladen' },
    },
  ],
  events: Object.values(UPLOAD_EVENTS),
  usageMetrics: [
    {
      name: UPLOAD_METRICS.bytes,
      kind: 'counter',
      unit: 'bytes',
      label: { en: 'Accepted upload bytes', de: 'Angenommene Upload-Bytes' },
    },
    {
      name: UPLOAD_METRICS.files,
      kind: 'counter',
      unit: 'count',
      label: { en: 'Accepted uploads', de: 'Angenommene Uploads' },
    },
  ],
  provides: { files: filesCapability },
  publicRoutes: uploadsPublicRoutes,
  adminRoutes(router) {
    uploadsAdminRoutes(router);
    uploadsMutationRoutes(router);
  },
  jobs(registrar) {
    registrar.register(
      { name: UPLOAD_JOBS.scan, retentionSeconds: 86400, retries: 2 },
      z
        .object({ fileId: fileIdSchema, attempt: z.number().int().min(0).max(2).default(0) })
        .strict(),
      scanUpload,
    );
    registrar.register(
      { name: UPLOAD_JOBS.cleanup, retentionSeconds: 86400, retries: 2 },
      z.object({ fileId: fileIdSchema }).strict(),
      cleanupUpload,
    );
  },
  notifications: { describe: describeUpload },
  retention: {
    purgeExpired: maintainUploads,
    recomputeExpiry: (runtime, instance) =>
      uploadsRepository(runtime).recomputeExpiry(instance.id, instance.config.retentionDays),
  },
  privacy: {
    exportSubject: exportUploadSubject,
    deleteSubject: deleteUploadSubject,
    pendingErasure: pendingUploadErasure,
    attachments: uploadSubjectAttachments,
    eraseScope: eraseUploadScope,
  },
});
