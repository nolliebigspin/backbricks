import { fileIdSchema, pageResult, repositoryPage, type ModuleAdminRouter } from '@backbricks/core';
import { z } from 'zod';

import {
  fileDetailSchema,
  filesPageSchema,
  filesQuerySchema,
  storageUsageSchema,
} from './admin-schemas.ts';
import { fileManagementMetadata } from './metadata.ts';
import { uploadManagementPolicy } from './policies.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Private projections share the same tenant/policy bridge as every module management route. */
export function uploadsAdminRoutes(router: ModuleAdminRouter<UploadsRuntime>) {
  router.register(
    {
      method: 'GET',
      resource: 'files',
      path: '/',
      operationId: 'uploads.files.list',
      input: z.object({ params: z.object({}).strict(), query: filesQuerySchema, body: z.null() }),
      responses: {
        200: {
          kind: 'json',
          description: 'A bounded page of private file metadata.',
          schema: filesPageSchema,
        },
      },
      policy: uploadManagementPolicy('files.list'),
    },
    async (runtime, { query }) => {
      const rows = await uploadsRepository(runtime).list(
        {
          instanceId: query.zoneId,
          status: query.status,
          query: query.q,
          ...(query.from ? { from: new Date(query.from) } : {}),
          ...(query.to ? { to: new Date(query.to) } : {}),
        },
        repositoryPage(query),
        runtime.services.clock.now(),
      );
      const page = pageResult(rows, query.limit);
      return Response.json({
        ...page,
        data: page.data.map((file) => fileManagementMetadata(file, runtime.services.clock.now())),
      });
    },
  );
  router.register(
    {
      method: 'GET',
      resource: 'files',
      path: '/{id}',
      operationId: 'uploads.files.read',
      input: z.object({
        params: z.object({ id: fileIdSchema }).strict(),
        query: z.object({}).strict(),
        body: z.null(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'Private file metadata, without credentials or object keys.',
          schema: fileDetailSchema,
        },
      },
      policy: uploadManagementPolicy('files.read'),
    },
    async (runtime, { params }) => {
      const file = await uploadsRepository(runtime).get(params.id, runtime.services.clock.now());
      return Response.json(
        fileDetailSchema.parse({
          ...fileManagementMetadata(file, runtime.services.clock.now()),
          metadata: file.metadata,
        }),
      );
    },
  );
  router.register(
    {
      method: 'GET',
      resource: 'storage-usage',
      path: '/',
      operationId: 'uploads.storage.usage',
      input: z.object({
        params: z.object({}).strict(),
        query: z.object({}).strict(),
        body: z.null(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'Current stored and reserved capacity in bytes, as decimal strings.',
          schema: storageUsageSchema,
        },
      },
      policy: uploadManagementPolicy('storage.usage', 'stats:read'),
    },
    async (runtime) => {
      const value = await uploadsRepository(runtime).usage(runtime.services.clock.now());
      return Response.json(
        storageUsageSchema.parse({
          count: value.count.toString(),
          storedBytes: value.storedBytes.toString(),
          reservedBytes: value.reservedBytes.toString(),
        }),
      );
    },
  );
}
