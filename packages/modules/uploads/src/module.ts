import { AppError, defineModule, fileIdSchema } from '@backbricks/core';
import { z } from 'zod';

import { classifyUploadsChange } from './changes.ts';
import { uploadsCodegen } from './codegen.ts';
import { uploadsConfigSchema, uploadsPublicWritePolicy } from './config.ts';
import {
  UPLOAD_CREATE_SCOPE,
  UPLOADS_MODULE_VERSION,
  UPLOAD_JOBS,
  UPLOAD_METRICS,
} from './constants.ts';
import { uploadsInfrastructure } from './infrastructure.ts';
import { uploadsPublicRoutes } from './public.ts';
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
  events: [],
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
  publicRoutes: uploadsPublicRoutes,
  jobs(registrar) {
    registrar.register(
      { name: UPLOAD_JOBS.scan, retentionSeconds: 86400, retries: 3 },
      z.object({ fileId: fileIdSchema }).strict(),
      async () => {
        // Fail closed while P3.4 installs the immutable-copy inspection worker.
        throw new AppError('service_unavailable');
      },
    );
  },
  retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
  privacy: {
    exportSubject: async () => ({ files: [] }),
    deleteSubject: async () => 0,
    eraseScope: async () => 0,
  },
});
