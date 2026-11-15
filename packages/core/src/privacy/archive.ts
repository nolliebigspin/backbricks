import { AppError } from '../errors/app-error.ts';
import { requireSessionRole } from '../identity/permissions.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import type { JsonValue } from '../modules/values.ts';
import type { TenantContext, TenantTransaction, WithTenant } from '../tenancy/tenant-context.ts';
import type { SubjectAttachment } from './attachments.ts';
import { subjectMetadataBytes, SUBJECT_EXPORT_LIMITS, assertSubjectArchiveSize } from './limits.ts';
import { createZipStream, type ZipEntry } from './zip.ts';

type ArchivePorts = {
  registry: ModuleRegistry;
  runtime: ReturnType<ModuleRegistry['bind']>;
  withTenant: WithTenant;
  prepare(
    tx: TenantTransaction,
    input: { email: string },
  ): Promise<{ email: string; modules: Record<string, JsonValue> }>;
  audit(tx: TenantTransaction, count: number, reason: 'started' | 'completed'): Promise<void>;
};

/** Initial authorization/plan/audit commits first; every later reader owns a fresh bounded frame. */
export async function exportSubjectArchive(
  deps: ArchivePorts,
  context: TenantContext,
  input: { email: string },
) {
  const plan = await deps.withTenant(context, async (tx) => {
    const prepared = await deps.prepare(tx, input);
    const files: { module: string; metadata: SubjectAttachment; path: string | null }[] = [];
    let bytes = 0;
    const identities = new Set<string>();
    for (const module of deps.registry.modules) {
      if (!module.privacy.attachments) continue;
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
        const page = await module.privacy.attachments.list(
          deps.runtime.forTenant(tx).execution(module.type),
          prepared.email,
          cursor,
        );
        for (const metadata of page.data) {
          const identity = `${module.type}:${metadata.id}`;
          if (files.length >= SUBJECT_EXPORT_LIMITS.records || identities.has(identity))
            throw new AppError('payload_too_large');
          identities.add(identity);
          const path =
            metadata.availability === 'ready' ? `files/${module.type}/${metadata.id}.bin` : null;
          if (path) bytes += metadata.size;
          files.push({ module: module.type, metadata, path });
        }
        if (page.nextCursor && (seen.has(page.nextCursor) || !page.data.length))
          throw new AppError('internal_error');
        if (page.nextCursor) seen.add(page.nextCursor);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    }
    const manifest = { modules: prepared.modules, files };
    const metadata = subjectMetadataBytes(manifest);
    assertSubjectArchiveSize(bytes, metadata.length, files.length);
    await deps.audit(tx, files.length, 'started');
    return { ...prepared, manifest };
  });
  let count = 0;
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const entry of plan.manifest.files) {
      if (!entry.path) continue;
      const module = deps.registry.get(entry.module);
      if (!module?.privacy.attachments) throw new AppError('capability_unavailable');
      // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
      const source = await deps.withTenant({ ...context, readOnly: true }, async (tx) => {
        requireSessionRole(tx, 'admin');
        return module.privacy.attachments!.open(
          deps.runtime.forTenant(tx).execution(module.type),
          plan.email,
          entry.metadata.id,
        );
      });
      if (source.status === 'unavailable') {
        entry.metadata.availability = source.reason;
        entry.path = null;
        continue;
      }
      count++;
      yield { path: entry.path, size: entry.metadata.size, stream: source.stream };
    }
    const metadata = subjectMetadataBytes(plan.manifest);
    yield { path: 'manifest.json', size: metadata.length, stream: new Blob([metadata]).stream() };
  }
  return createZipStream(entries(), () =>
    deps.withTenant(context, (tx) => deps.audit(tx, count, 'completed')),
  );
}
