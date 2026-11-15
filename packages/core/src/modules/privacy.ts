import type { SubjectAttachmentPage, SubjectAttachmentSource } from '../privacy/attachments.ts';
import type { ModuleErasureResult } from './erasure.ts';
import type { JsonValue } from './values.ts';

/** Each hook receives only its own module frame. Attachment bytes require declared storage. */
export type ModulePrivacyHooks<Runtime> = {
  exportSubject(this: void, runtime: Runtime, email: string): Promise<JsonValue>;
  deleteSubject(this: void, runtime: Runtime, email: string): Promise<number>;
  eraseScope(this: void, runtime: Runtime, input: { limit: number }): Promise<ModuleErasureResult>;
  /** Conservatively wait for every pending physical deletion in the project; no subject identity survives. */
  pendingErasure?(this: void, runtime: Runtime): Promise<Date | null>;
  attachments?: {
    list(
      this: void,
      runtime: Runtime,
      email: string,
      cursor?: string,
    ): Promise<SubjectAttachmentPage>;
    open(this: void, runtime: Runtime, email: string, id: string): Promise<SubjectAttachmentSource>;
  };
};
