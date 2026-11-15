import {
  AppError,
  principalActor,
  fileClaimSchema,
  fileOwnerSchema,
  fileOwnerExpirySchema,
  parseFileReference,
  earliestExpiry,
  expiresAfterDays,
  MAX_BULK_ITEMS,
  type FilesCapability,
  type ConfiguredInstance,
} from '@backbricks/core';

import type { UploadsConfig } from './config.ts';
import { UPLOAD_AUDIT_ACTIONS } from './constants.ts';
import { requestFileDeletion } from './deletion.ts';
import { attachmentMetadata } from './metadata.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';
import { verifyUploadToken } from './tokens.ts';
import { isUsableFile } from './usability.ts';
import { validateUploadDeclaration } from './validation.ts';

/** Borrowed operations remain bound to the caller's transaction; no other module repository is visible. */
export function filesCapability(runtime: UploadsRuntime): FilesCapability {
  const repository = uploadsRepository(runtime);
  return {
    async claim(_tx, input) {
      const parsed = fileClaimSchema.safeParse(input);
      if (!parsed.success) throw new AppError('validation_failed');
      const request = parsed.data;
      const now = runtime.services.clock.now();
      if (request.expiresAt && request.expiresAt <= now) throw new AppError('validation_failed');
      const refs = request.files.map((file) => {
        const ref = parseFileReference(file.ref);
        if (!ref) throw new AppError('validation_failed');
        return { ...ref, zone: file.zone };
      });
      if (new Set(refs.map((ref) => ref.fileId)).size !== refs.length)
        throw new AppError('validation_failed');
      await repository.lockProject({ write: true });
      // A trusted owner receives one atomic set; appending later would need an explicit owner mutation contract.
      if ((await repository.byOwner(request.owner, now, { includeInactive: true })).length)
        throw new AppError('conflict');
      const zones = new Map<string, ConfiguredInstance<UploadsConfig>>();
      for (const ref of refs.toSorted((a, b) => a.fileId.localeCompare(b.fileId))) {
        // oxlint-disable-next-line no-await-in-loop -- Lock parent zones before file rows in a stable order.
        const key = await repository.resolveZoneKey(ref.fileId, now, { lock: true });
        if (key !== ref.zone) throw new AppError('not_found');
        if (!zones.has(key)) {
          // oxlint-disable-next-line no-await-in-loop -- Reuse each already-locked zone's current config.
          const zone = await runtime.instances.get(key);
          if (zone.status !== 'active') throw new AppError('not_found');
          zones.set(key, zone);
        }
      }
      const rows = await repository.lockMany(
        refs.map((ref) => ref.fileId),
        now,
      );
      const byId = new Map(rows.map((file) => [file.id, file]));
      for (const ref of refs) {
        const file = byId.get(ref.fileId);
        const zone = zones.get(ref.zone);
        if (
          !file ||
          !zone ||
          file.instanceId !== zone.id ||
          !isUsableFile(file, now) ||
          file.ownerId ||
          (zone.config.scanRequired && file.scan?.status !== 'clean')
        )
          throw new AppError('not_found');
        // oxlint-disable-next-line no-await-in-loop -- Verify the entire locked set before any ownership changes.
        await verifyUploadToken(file.uploadTokenHash, ref.uploadToken);
        validateUploadDeclaration(zone.config, {
          name: file.originalName,
          type: file.detectedMime,
          size: file.sizeBytes,
        });
      }
      const claimed = [];
      for (const ref of refs) {
        const file = byId.get(ref.fileId);
        const zone = zones.get(ref.zone);
        if (!file || !zone) throw new AppError('internal_error');
        const zoneExpiry =
          zone.config.retentionDays === null
            ? null
            : expiresAfterDays(file.createdAt, zone.config.retentionDays);
        // oxlint-disable-next-line no-await-in-loop -- All assignments share the caller transaction after whole-set validation.
        const saved = await repository.patch(file.id, {
          ownerType: request.owner.type,
          ownerId: request.owner.id,
          ownerExpiresAt: request.expiresAt,
          subjectEmail: request.subjectEmail,
          expiresAt: earliestExpiry(request.expiresAt, zoneExpiry),
          updatedAt: now,
        });
        claimed.push(attachmentMetadata(saved));
      }
      await runtime.services.audit.record(runtime.tx, {
        ...(runtime.tx.context.principal
          ? principalActor(runtime.tx.context.principal)
          : { actorType: 'system' as const, actorId: null }),
        action: UPLOAD_AUDIT_ACTIONS.claimed,
        targetType: request.owner.type,
        targetId: request.owner.id,
        changes: { count: claimed.length },
      });
      return claimed;
    },
    async listByOwner(_tx, owner) {
      const rows = await repository.byOwner(
        fileOwnerSchema.parse(owner),
        runtime.services.clock.now(),
      );
      if (rows.length > MAX_BULK_ITEMS) throw new AppError('internal_error');
      return rows.map(attachmentMetadata);
    },
    async syncOwnerExpiry(_tx, input) {
      const request = fileOwnerExpirySchema.parse(input);
      const now = runtime.services.clock.now();
      await repository.lockProject();
      for (const owner of request.owners) {
        // oxlint-disable-next-line no-await-in-loop -- Bounded owner batches share the caller transaction.
        const rows = await repository.byOwner({ type: request.type, id: owner.id }, now, {
          includeInactive: true,
        });
        if (rows.length > MAX_BULK_ITEMS) throw new AppError('internal_error');
        for (const file of rows) {
          // oxlint-disable-next-line no-await-in-loop -- Preserve earlier zone/file bounds while updating the owner bound.
          await repository.patch(file.id, {
            ownerExpiresAt: owner.expiresAt,
            expiresAt: earliestExpiry(file.expiresAt, owner.expiresAt),
            updatedAt: now,
          });
        }
      }
    },
    async deleteByOwner(_tx, owner) {
      const now = runtime.services.clock.now();
      await repository.lockProject({ write: true });
      const rows = await repository.byOwner(fileOwnerSchema.parse(owner), now, {
        includeInactive: true,
      });
      if (rows.length > MAX_BULK_ITEMS) throw new AppError('internal_error');
      if (!rows.length) return;
      const locked = await repository.lockMany(
        rows.map((file) => file.id),
        now,
        { includeInactive: true },
      );
      for (const file of locked) {
        // oxlint-disable-next-line no-await-in-loop -- Durable deletion and caller's owner mutation share one transaction.
        await requestFileDeletion(runtime, file);
      }
    },
  };
}
