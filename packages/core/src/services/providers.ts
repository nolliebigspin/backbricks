import type { z } from 'zod';

import type {
  signedStorageRequestSchema,
  storageObjectSchema,
  inlineImageTypeSchema,
} from '../storage/schemas.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';

export type SignedStorageRequest = z.infer<typeof signedStorageRequestSchema>;
export type StorageObject = z.infer<typeof storageObjectSchema>;
export type InlineImageType = z.infer<typeof inlineImageTypeSchema>;

/** Private object storage. Implementations validate TTL/headers and default downloads to attachment. */
export interface StorageAdapter {
  presignPut(input: {
    key: string;
    contentType: string;
    size: number;
    expiresInSeconds: number;
  }): Promise<SignedStorageRequest>;
  presignGet(input: {
    key: string;
    expiresInSeconds: number;
    downloadName?: string;
    inlineImageType?: InlineImageType;
  }): Promise<string>;
  head(key: string): Promise<StorageObject | null>;
  copy(source: string, target: string): Promise<void>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<ReadableStream<Uint8Array>>;
}

export type ScanVerdict = { status: 'clean' } | { status: 'infected'; signature: string };
/** Provider outages throw a safe retryable error; input is a private copy's stream (I9). */
export interface Scanner {
  scan(stream: ReadableStream<Uint8Array>): Promise<ScanVerdict>;
}

/** Provider owns its wire schema; callers validate the challenge rather than duplicating library types. */
export interface CaptchaProvider<TChallenge = unknown> {
  challengeSchema: z.ZodType<TChallenge>;
  create(input: { projectId: string; expiresAt: Date }): Promise<TChallenge>;
  verify(solution: unknown, input: { projectId: string; now: Date }): Promise<boolean>;
}

/** Only the transaction-bound adapter may map this handle to its physical queue transaction. */
export interface Queue {
  enqueue(
    tx: TenantTransaction,
    name: string,
    payload: unknown,
    options?: { notBefore?: Date; singletonKey?: string },
  ): Promise<string>;
}

export type BillingPlanChange = { eventId: string; organizationId: string; plan: string | null };
/** Provider-neutral boundary only; provider selection and plan/billing behavior belong to C1/C2. */
export interface BillingProvider {
  checkout(input: { organizationId: string; plan: string; returnUrl: string }): Promise<string>;
  portal(input: { organizationId: string; returnUrl: string }): Promise<string>;
  verifyWebhook(body: Uint8Array, headers: Headers): Promise<BillingPlanChange>;
}
