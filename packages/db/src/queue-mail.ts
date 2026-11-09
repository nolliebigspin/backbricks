import {
  AppError,
  mailDeliverySchema,
  MAIL_JOB_NAME,
  MAIL_JOB_RETENTION_SECONDS,
  type Clock,
  type MailMessage,
  type Mailer,
  type TenantTransaction,
} from '@backbricks/core';
import { sql } from 'drizzle-orm';
import { fromDrizzle, type PgBoss } from 'pg-boss';

import type { DbTransaction } from './client.ts';
import { queueSingletonId } from './queue-identities.ts';
import { transactionFor } from './transaction-binding.ts';

/** Restricted delivery channel; token/recipient payloads never enter the general event outbox. */
export function createMailQueue(
  boss: PgBoss,
  clock: Clock,
  report: (name: string) => void,
  isStarted: () => boolean,
  securityRecipient: (organizationId: string, to: string) => Promise<boolean>,
) {
  const enqueueMail = async (
    tx: DbTransaction,
    messages: readonly MailMessage[],
    identity?: string,
    securityOrganizationId?: string,
  ) => {
    if (!isStarted()) throw new AppError('service_unavailable');
    for (const message of messages) {
      const payload = mailDeliverySchema.parse({
        message,
        securityOrganizationId,
        expiresAt: new Date(
          clock.now().getTime() + MAIL_JOB_RETENTION_SECONDS * 1000,
        ).toISOString(),
      });
      // oxlint-disable-next-line no-await-in-loop -- Enlist each delivery in this exact caller transaction.
      await boss.send(MAIL_JOB_NAME, payload, {
        db: fromDrizzle(tx, sql),
        ...(identity ? { id: queueSingletonId([MAIL_JOB_NAME, identity, message.to]) } : {}),
      });
    }
  };
  return {
    async startMail() {
      const policy = {
        retryLimit: 1440,
        retryDelay: 1,
        retryBackoff: true,
        retryDelayMax: 60,
        expireInSeconds: 60,
        retentionSeconds: MAIL_JOB_RETENTION_SECONDS,
        deleteAfterSeconds: MAIL_JOB_RETENTION_SECONDS,
      };
      await boss.createQueue(MAIL_JOB_NAME, policy);
      await boss.updateQueue(MAIL_JOB_NAME, policy);
    },
    enqueueMail,
    /** Notification mail to verified members resolved by the delivery job in this transaction. */
    enqueueNotificationMail: (
      tx: TenantTransaction,
      messages: readonly MailMessage[],
      identity: string,
    ) => enqueueMail(transactionFor(tx), messages, identity),
    enqueueSecurityMail: (
      tx: TenantTransaction,
      messages: readonly MailMessage[],
      identity: string,
    ) => enqueueMail(transactionFor(tx), messages, identity, tx.context.organizationId),
    async consumeMail(mailer: Mailer | null) {
      if (!mailer) return;
      await boss.work<unknown>(
        MAIL_JOB_NAME,
        { batchSize: 1, localConcurrency: 2, pollingIntervalSeconds: 0.5 },
        async (jobs) => {
          const job = jobs[0];
          if (!job) return;
          try {
            const payload = mailDeliverySchema.parse(job.data);
            const permitted =
              !payload.securityOrganizationId ||
              (await securityRecipient(payload.securityOrganizationId, payload.message.to));
            if (new Date(payload.expiresAt) > clock.now() && permitted)
              await mailer.send(payload.message);
            // Success/expiry hard-deletes recipient and bearer-link payloads immediately.
            await boss.deleteJob(MAIL_JOB_NAME, job.id);
          } catch {
            report(MAIL_JOB_NAME);
            throw new Error('Mail delivery failed.');
          }
        },
      );
    },
  };
}
