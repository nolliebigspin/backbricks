import { AppError } from '../errors/app-error.ts';
import type { QueueJobHandler } from '../jobs/contract.ts';
import { PLATFORM_JOBS } from '../jobs/platform-names.ts';
import type { MailMessage } from '../mail/contract.ts';
import { renderNotificationMail, type NotificationLocale } from '../mail/notifications.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import type { ModuleInstance } from '../platform/models.ts';
import type { Queue } from '../services/providers.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { notificationDeliveryPayloadSchema, notificationDigestPayloadSchema } from './jobs.ts';
import type { NotificationRule } from './schemas.ts';
import { throttleDecision } from './throttle.ts';

/**
 * Enlists rendered messages in the restricted mail channel (ADR-0049) inside the job transaction.
 * The server passes this only when SMTP is configured; without it delivery is a no-op.
 */
export type NotificationMailEnqueue = (
  tx: TenantTransaction,
  messages: readonly MailMessage[],
  identity: string,
) => Promise<void>;
export type NotificationDeliveryOptions = {
  publicUrl: string;
  enqueueMail: NotificationMailEnqueue;
};
/** Members have no stored language yet; dashboard preferences will choose per recipient. */
const LOCALE: NotificationLocale = 'en';

async function optional<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') return null;
    throw error;
  }
}
const segment = encodeURIComponent;
const recipients = (tx: TenantTransaction, rule: NotificationRule) =>
  tx.repositories.notificationRules.recipients(rule.recipientUserIds);

/** Delivery and digest workers. Queue payloads carry IDs; rule, members and content are read now. */
export function createNotificationDeliveryHandlers(
  deps: {
    registry: ModuleRegistry;
    runtime: ReturnType<ModuleRegistry['bind']>;
    clock: Clock;
  },
  queue?: Queue,
  delivery?: NotificationDeliveryOptions,
): QueueJobHandler[] {
  function source(tx: TenantTransaction, instance: ModuleInstance) {
    const module = deps.registry.get(instance.moduleType);
    if (!module || !tx.context.projectId) return null;
    return {
      module,
      path: `/projects/${segment(tx.context.projectId)}/${segment(module.resourceName.plural)}/${segment(instance.key)}`,
    };
  }
  return [
    {
      name: PLATFORM_JOBS.notificationDelivery,
      async runInTransaction(this: void, tx, input) {
        const data = notificationDeliveryPayloadSchema.parse(input);
        if (!delivery) return;
        if (!tx.context.projectId) throw new AppError('not_found');
        const rule = await optional(tx.repositories.notificationRules.get(data.ruleId));
        if (!rule?.enabled || (rule.instanceId && rule.instanceId !== data.instanceId)) return;
        const instance = await optional(tx.repositories.instances.get(data.instanceId));
        if (!instance || instance.status === 'archived') return;
        const target = source(tx, instance);
        const notifier = target?.module.notifications;
        if (!target || !notifier || !target.module.events.some((e) => e.name === rule.eventType))
          return;
        const subject = await notifier.describe(
          deps.runtime.forTenant(tx).execution(target.module.type),
          {
            eventType: rule.eventType,
            subjectId: data.subjectId,
            instance,
            includeContent: rule.includeContent,
          },
        );
        if (!subject) return;
        const members = await recipients(tx, rule);
        const state = await tx.repositories.notificationRules.throttleState(rule.id);
        if (!members.length || !state) return;
        const decision = throttleDecision(state, rule.maxPerHour, deps.clock.now());
        await tx.repositories.notificationRules.saveThrottle(rule.id, decision.state);
        if (decision.action === 'suppress') {
          if (!decision.digestAt) return;
          if (!queue) throw new AppError('service_unavailable');
          const windowStart = decision.state.windowStart?.toISOString() ?? '';
          await queue.enqueue(
            tx,
            PLATFORM_JOBS.notificationDigest,
            { ruleId: rule.id, windowStart },
            { singletonKey: `${rule.id}:${windowStart}`, notBefore: decision.digestAt },
          );
          return;
        }
        await delivery.enqueueMail(
          tx,
          members.map((member) =>
            renderNotificationMail(delivery.publicUrl, {
              kind: 'entry',
              to: member.email,
              locale: LOCALE,
              sourceName: instance.name,
              at: new Date(data.occurredAt),
              path: `${target.path}?entry=${segment(data.subjectId)}`,
              fields: subject.fields,
            }),
          ),
          `${data.eventId}:${rule.id}`,
        );
      },
    },
    {
      name: PLATFORM_JOBS.notificationDigest,
      async runInTransaction(this: void, tx, input) {
        const data = notificationDigestPayloadSchema.parse(input);
        if (!delivery) return;
        if (!tx.context.projectId) throw new AppError('not_found');
        const rule = await optional(tx.repositories.notificationRules.get(data.ruleId));
        const state = rule && (await tx.repositories.notificationRules.throttleState(rule.id));
        if (!rule || !state?.suppressed) return;
        // Taking the count and sending share this transaction, so a retry never reports it twice.
        await tx.repositories.notificationRules.saveThrottle(rule.id, { ...state, suppressed: 0 });
        if (!rule.enabled) return;
        let sourceName: string;
        let path: string;
        if (rule.instanceId) {
          const instance = await optional(tx.repositories.instances.get(rule.instanceId));
          const target = instance && instance.status !== 'archived' && source(tx, instance);
          if (!instance || !target) return;
          sourceName = instance.name;
          path = target.path;
        } else {
          const project = await tx.repositories.projects.get(tx.context.projectId);
          sourceName = project.name;
          path = `/projects/${segment(project.id)}`;
        }
        const members = await recipients(tx, rule);
        if (!members.length) return;
        await delivery.enqueueMail(
          tx,
          members.map((member) =>
            renderNotificationMail(delivery.publicUrl, {
              kind: 'digest',
              to: member.email,
              locale: LOCALE,
              sourceName,
              at: new Date(data.windowStart),
              path,
              count: state.suppressed,
            }),
          ),
          `digest:${rule.id}:${data.windowStart}`,
        );
      },
    },
  ];
}
