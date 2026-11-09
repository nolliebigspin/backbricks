import { AppError } from '../errors/app-error.ts';
import { pageResult } from '../http/pagination.ts';
import { requireSessionRole } from '../identity/permissions.ts';
import type { Ids } from '../ids/type-id.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { principalActor, type AuditService, type EventService } from '../services/activity.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { RepositoryPage } from '../tenancy/repositories.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import {
  notificationRuleCreateSchema,
  notificationRulePatchSchema,
  type NotificationRule,
  type NotificationRuleCreate,
  type NotificationRulePatch,
} from './schemas.ts';

/** Generic notification configuration; no module data or unverified recipient addresses enter rules. */
export function createNotificationRuleService(deps: {
  registry: ModuleRegistry;
  ids: Ids;
  clock: Clock;
  audit: AuditService;
  events: EventService;
  emailAvailable: boolean;
}) {
  const events = deps.registry.modules.flatMap((module) => module.events);
  const eventModules = new Map(
    deps.registry.modules.flatMap((module) =>
      module.events.map((event) => [event.name, module] as const),
    ),
  );
  async function validate(
    tx: TenantTransaction,
    input: Pick<NotificationRule, 'instanceId' | 'eventType' | 'recipientUserIds' | 'enabled'>,
  ) {
    const module = eventModules.get(input.eventType);
    if (!module)
      throw new AppError('validation_failed', {
        detail: 'Choose an event from an enabled module.',
      });
    if (input.enabled && input.recipientUserIds.length === 0)
      throw new AppError('validation_failed', { detail: 'Choose at least one verified member.' });
    if (input.instanceId) {
      const instance = await tx.repositories.instances.get(input.instanceId);
      if (instance.status === 'archived' || instance.moduleType !== module.type)
        throw new AppError('not_found');
    }
    const recipients = await tx.repositories.notificationRules.recipients(input.recipientUserIds);
    if (recipients.length !== input.recipientUserIds.length)
      throw new AppError('validation_failed', {
        detail: 'Choose verified members of this organization.',
      });
  }
  async function record(
    tx: TenantTransaction,
    action: string,
    row: NotificationRule,
    fields: string[],
  ) {
    await deps.audit.record(tx, {
      ...principalActor(requireSessionRole(tx, 'admin')),
      action,
      targetType: 'notification_rule',
      targetId: row.id,
      changes: { changedFields: fields },
    });
    await deps.events.publish(tx, {
      type: action,
      subjectType: 'notification_rule',
      subjectId: row.id,
      payload: { changedFields: fields },
    });
  }
  return {
    async list(tx: TenantTransaction, page: RepositoryPage) {
      requireSessionRole(tx, 'admin');
      return pageResult(await tx.repositories.notificationRules.list(page), page.limit);
    },
    async options(tx: TenantTransaction) {
      requireSessionRole(tx, 'admin');
      return {
        events,
        recipients: await tx.repositories.notificationRules.recipients(),
        emailAvailable: deps.emailAvailable,
      };
    },
    async create(tx: TenantTransaction, input: NotificationRuleCreate) {
      requireSessionRole(tx, 'admin');
      const data = notificationRuleCreateSchema.parse(input);
      await tx.repositories.notificationRules.lock();
      await validate(tx, data);
      const now = deps.clock.now();
      const row = await tx.repositories.notificationRules.insert({
        ...data,
        id: deps.ids.generate('ntf'),
        channel: 'email',
        createdAt: now,
        updatedAt: now,
      });
      await record(tx, CORE_EVENTS.notificationRuleCreated, row, Object.keys(data));
      return row;
    },
    async update(tx: TenantTransaction, id: string, input: NotificationRulePatch) {
      requireSessionRole(tx, 'admin');
      const data = notificationRulePatchSchema.parse(input);
      await tx.repositories.notificationRules.lock();
      const previous = await tx.repositories.notificationRules.get(id);
      await validate(tx, { ...previous, ...data });
      const row = await tx.repositories.notificationRules.update(id, {
        ...data,
        updatedAt: deps.clock.now(),
      });
      await record(tx, CORE_EVENTS.notificationRuleUpdated, row, Object.keys(data));
      return row;
    },
    async delete(tx: TenantTransaction, id: string) {
      requireSessionRole(tx, 'admin');
      await tx.repositories.notificationRules.lock();
      const row = await tx.repositories.notificationRules.get(id);
      await tx.repositories.notificationRules.delete(id);
      await record(tx, CORE_EVENTS.notificationRuleDeleted, row, []);
    },
  };
}
