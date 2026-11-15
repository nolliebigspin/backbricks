import { AppError, type ConfiguredInstance, type FileScanResult } from '@backbricks/core';

import type { UploadsConfig } from './config.ts';
import { type UPLOAD_EVENTS, UPLOAD_JOBS, UPLOAD_RETRIES } from './constants.ts';
import { inspectFinalFile } from './inspection.ts';
import { finishUpload } from './outcomes.ts';
import type { UploadChanges, UploadRecord } from './repository.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';
import { validateUploadDeclaration } from './validation.ts';

type ScanOutcome = {
  status: keyof typeof UPLOAD_EVENTS;
  scan: FileScanResult;
  changes: UploadChanges;
};
function failedOutcome(reason: string, now: Date): ScanOutcome {
  return {
    status: 'rejected',
    scan: { status: 'failed', reason, checkedAt: now.toISOString() },
    changes: { updatedAt: now },
  };
}
/** Provider I/O is isolated from terminal persistence so audit/queue errors cannot become scan verdicts. */
async function inspectCopy(
  runtime: UploadsRuntime,
  file: UploadRecord,
  zone: ConfiguredInstance<UploadsConfig>,
): Promise<ScanOutcome> {
  const repository = uploadsRepository(runtime);
  const now = runtime.services.clock.now();
  const storage = runtime.services.require('storage');
  const scanner = runtime.services.optional('scanner');
  if (zone.config.scanRequired && !scanner) throw new AppError('service_unavailable');
  const final = await storage.head(file.storageKey);
  if (!final && !file.copiedAt) await storage.copy(file.stagingKey, file.storageKey);
  else if (!final) return failedOutcome('final_missing', now);
  await repository.patch(file.id, { copiedAt: file.copiedAt ?? now, updatedAt: now });
  await storage.delete(file.stagingKey);
  await repository.patch(file.id, { stagingCleanedAt: now, updatedAt: now });
  const head = await storage.head(file.storageKey);
  if (!head || head.size !== file.sizeBytes) return failedOutcome('size_mismatch', now);
  const result = await inspectFinalFile(storage, file, scanner);
  const evidence = { detectedMime: result.detectedMime, sha256: result.sha256, updatedAt: now };
  if (!result.infected) {
    try {
      validateUploadDeclaration(zone.config, {
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
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'validation_failed') throw error;
      return { ...failedOutcome('format_mismatch', now), changes: evidence };
    }
  }
  return {
    status: result.infected ? 'quarantined' : 'ready',
    scan: {
      status: result.infected ? 'infected' : scanner ? 'clean' : 'not_scanned',
      checkedAt: now.toISOString(),
    },
    changes: evidence,
  };
}

/** Attempts are durable continuations; a duplicate delivery cannot consume a later attempt's budget. */
export async function scanUpload(
  runtime: UploadsRuntime,
  input: { fileId: string; attempt?: number },
): Promise<void> {
  const repository = uploadsRepository(runtime);
  const now = runtime.services.clock.now();
  let file: UploadRecord;
  try {
    file = await repository.get(input.fileId, now);
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') return;
    throw error;
  }
  if (!['uploaded', 'scanning'].includes(file.status)) return;
  await repository.lockProject();
  // A shared zone lock precedes file locks; config updates take the same parent-first order.
  const key = await repository.resolveZoneKey(file.id, now, { lock: true });
  const zone = await runtime.instances.get(key);
  file = await repository.get(file.id, now, { lock: true });
  if (!['uploaded', 'scanning'].includes(file.status) || (input.attempt ?? 0) !== file.scanAttempts)
    return;
  file = await repository.patch(file.id, {
    scanAttempts: file.scanAttempts + 1,
    status: 'scanning',
    updatedAt: now,
  });
  let outcome: ScanOutcome;
  try {
    outcome = await inspectCopy(runtime, file, zone);
  } catch (error) {
    if (error instanceof AppError && error.code === 'validation_failed')
      outcome = failedOutcome('size_mismatch', now);
    else {
      if (!(error instanceof AppError) || error.code !== 'service_unavailable') throw error;
      if (file.scanAttempts >= UPLOAD_RETRIES.scanAttempts)
        outcome = failedOutcome('provider_unavailable', now);
      else {
        const queue = runtime.services.optional('queue');
        if (!queue) throw error;
        await repository.patch(file.id, {
          scan: { status: 'retrying', checkedAt: now.toISOString() },
          updatedAt: now,
        });
        const delay =
          UPLOAD_RETRIES.scanDelaysMs[file.scanAttempts - 1] ?? UPLOAD_RETRIES.scanDelaysMs[1];
        await queue.enqueue(
          runtime.tx,
          UPLOAD_JOBS.scan,
          { fileId: file.id, attempt: file.scanAttempts },
          { notBefore: new Date(now.getTime() + delay) },
        );
        return;
      }
    }
  }
  await finishUpload(runtime, file, outcome.status, outcome.scan, outcome.changes);
}
