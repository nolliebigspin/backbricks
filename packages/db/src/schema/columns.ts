import {
  actorTypeSchema,
  apiKeyKindSchema,
  moduleInstanceStatusSchema,
  notificationChannelSchema,
} from '@backbricks/core';
import { pgEnum, text, timestamp } from 'drizzle-orm/pg-core';

import { organization } from './auth.generated.ts';

export const actorType = pgEnum('actor_type', actorTypeSchema.enum);
export const apiKeyKind = pgEnum('api_key_kind', apiKeyKindSchema.enum);
export const moduleInstanceStatus = pgEnum(
  'module_instance_status',
  moduleInstanceStatusSchema.enum,
);
export const notificationChannel = pgEnum('notification_channel', notificationChannelSchema.enum);

export function organizationIdColumn() {
  return text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' });
}

export function tenantProjectColumns() {
  return { organizationId: organizationIdColumn(), projectId: text('project_id').notNull() };
}

export function timestampColumn(name: string) {
  return timestamp(name, { withTimezone: true });
}

export function recordTimestamps() {
  return {
    createdAt: timestampColumn('created_at').notNull(),
    updatedAt: timestampColumn('updated_at').notNull(),
  };
}
