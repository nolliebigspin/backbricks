import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { requireSessionRole } from '../identity/permissions.ts';
import { PLATFORM_JOBS } from '../jobs/platform-names.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { jsonValueWireSchema, type JsonValue } from '../modules/values.ts';
import { emailAddressSchema } from '../platform/values.ts';
import { principalActor, type AuditService } from '../services/activity.ts';
import type { Queue } from '../services/providers.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';

/** Subject emails are matched normalized, like the modules store them (e.g. forms `subject_email`). */
export const subjectRequestSchema = z
  .object({ email: emailAddressSchema.transform((email) => email.toLowerCase()) })
  .strict();
export type SubjectRequest = z.input<typeof subjectRequestSchema>;
export const subjectExportResponseSchema = z
  .object({ modules: z.record(z.string(), jsonValueWireSchema) })
  .strict();
export const subjectErasureResponseSchema = z.object({ status: z.literal('queued') }).strict();

function project(tx: TenantTransaction) {
  if (!tx.context.projectId) throw new AppError('not_found');
  return tx.context.projectId;
}

/**
 * GDPR access and erasure for one project (Art. 15/17). Owner/admin sessions only; audit entries
 * record the action and a count, never the email. Erasure runs as the existing platform job.
 */
export function createSubjectPrivacyService(deps: {
  registry: ModuleRegistry;
  runtime: ReturnType<ModuleRegistry['bind']>;
  audit: AuditService;
  queue?: Queue;
}) {
  return {
    async exportSubject(tx: TenantTransaction, input: SubjectRequest) {
      const principal = requireSessionRole(tx, 'admin');
      const projectId = project(tx);
      const { email } = subjectRequestSchema.parse(input);
      const modules: Record<string, JsonValue> = {};
      for (const module of deps.registry.modules) {
        // oxlint-disable-next-line no-await-in-loop -- Every module reads in the caller transaction.
        modules[module.type] = await module.privacy.exportSubject(
          deps.runtime.forTenant(tx).execution(module.type),
          email,
        );
      }
      await deps.audit.record(tx, {
        ...principalActor(principal),
        action: 'privacy.subject_exported',
        targetType: 'project',
        targetId: projectId,
        changes: { count: Object.keys(modules).length },
      });
      return subjectExportResponseSchema.parse({ modules });
    },
    async eraseSubject(tx: TenantTransaction, input: SubjectRequest) {
      const principal = requireSessionRole(tx, 'admin');
      const projectId = project(tx);
      const { email } = subjectRequestSchema.parse(input);
      if (!deps.queue) throw new AppError('service_unavailable');
      // The job payload holds the email only for the job's bounded retention (ADR-0048/0050).
      await deps.queue.enqueue(tx, PLATFORM_JOBS.subjectErasure, { email });
      await deps.audit.record(tx, {
        ...principalActor(principal),
        action: 'privacy.subject_erasure_requested',
        targetType: 'project',
        targetId: projectId,
      });
      return subjectErasureResponseSchema.parse({ status: 'queued' });
    },
  };
}
export type SubjectPrivacyService = ReturnType<typeof createSubjectPrivacyService>;
