import { AppError } from '@backbricks/core';

import { inspectFinalFile } from './inspection.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';
import { validateUploadDeclaration } from './validation.ts';

/** COPY is never repeated over an existing private final object, including after a SQL rollback. */
export async function scanUpload(
  runtime: UploadsRuntime,
  input: { fileId: string },
): Promise<void> {
  const repository = uploadsRepository(runtime);
  const now = runtime.services.clock.now();
  let file = await repository.get(input.fileId, now, { lock: true });
  if (!['uploaded', 'scanning'].includes(file.status)) return;
  const storage = runtime.services.require('storage');
  const zone = await runtime.instances.get(await repository.resolveZoneKey(file.id, now));
  const config = zone.config;
  const scanner = runtime.services.optional('scanner');
  if (config.scanRequired && !scanner) throw new AppError('service_unavailable');
  const final = await storage.head(file.storageKey);
  if (!final && !file.copiedAt) {
    await storage.copy(file.stagingKey, file.storageKey);
  } else if (!final) {
    await repository.patch(file.id, { status: 'rejected', updatedAt: now });
    return;
  }
  file = await repository.patch(file.id, {
    status: 'scanning',
    copiedAt: file.copiedAt ?? now,
    updatedAt: now,
  });
  await storage.delete(file.stagingKey);
  await repository.patch(file.id, { stagingCleanedAt: now, updatedAt: now });
  const head = await storage.head(file.storageKey);
  if (!head || head.size !== file.sizeBytes) {
    await repository.patch(file.id, { status: 'rejected', updatedAt: now });
    return;
  }
  try {
    const result = await inspectFinalFile(storage, file, scanner);
    if (!result.infected) {
      validateUploadDeclaration(config, {
        name: file.originalName,
        type: result.detectedMime,
        size: head.size,
      });
      if (
        !result.allowedPackage ||
        result.detectedMime !== file.declaredMime ||
        zone.configVersion !== file.configVersion
      )
        throw new AppError('validation_failed');
    }
    await repository.patch(file.id, {
      status: result.infected ? 'quarantined' : 'ready',
      detectedMime: result.detectedMime,
      sha256: result.sha256,
      scan: {
        status: result.infected ? 'infected' : scanner ? 'clean' : 'not_scanned',
        checkedAt: now.toISOString(),
      },
      updatedAt: now,
    });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'validation_failed') throw error;
    await repository.patch(file.id, { status: 'rejected', updatedAt: now });
  }
}
