import type { RepositoryPage } from '../tenancy/page.ts';
import type { NotificationRecipient, NotificationRule } from './schemas.ts';

/** Rule configuration is tenant-scoped; addresses are resolved from active verified memberships. */
export interface NotificationRuleRepository {
  /** Serialize recipient validation/config changes with organization membership changes. */
  lock(): Promise<void>;
  list(page: RepositoryPage): Promise<NotificationRule[]>;
  get(id: string): Promise<NotificationRule>;
  insert(input: Omit<NotificationRule, 'organizationId' | 'projectId'>): Promise<NotificationRule>;
  update(
    id: string,
    input: Partial<
      Pick<
        NotificationRule,
        | 'instanceId'
        | 'eventType'
        | 'recipientUserIds'
        | 'includeContent'
        | 'enabled'
        | 'maxPerHour'
      >
    > & { updatedAt: Date },
  ): Promise<NotificationRule>;
  delete(id: string): Promise<void>;
  recipients(userIds?: readonly string[]): Promise<NotificationRecipient[]>;
  matching(
    eventType: string,
    instanceId: string | null,
    page: RepositoryPage,
  ): Promise<NotificationRule[]>;
  /** Organization-wide membership removal, within the auth mutation's outer transaction. */
  removeRecipient(userId: string, now: Date): Promise<number>;
}
