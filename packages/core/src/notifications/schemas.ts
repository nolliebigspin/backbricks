import { z } from 'zod';

import { membershipSchema } from '../identity/organization.ts';
import { activityNameSchema } from '../platform/activity-fields.ts';
import { notificationChannelSchema } from '../platform/values.ts';

export const MAX_NOTIFICATION_RECIPIENTS = 20;
export const MAX_NOTIFICATION_HOURLY_LIMIT = 100;
export const DEFAULT_NOTIFICATION_HOURLY_LIMIT = 10;
const recipients = z
  .array(membershipSchema.shape.userId)
  .max(MAX_NOTIFICATION_RECIPIENTS)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Choose distinct members.' });
const writable = z
  .object({
    eventType: activityNameSchema,
    instanceId: z.string().min(1).max(128).nullable(),
    recipientUserIds: recipients.refine((ids) => ids.length > 0, {
      message: 'Choose at least one member.',
    }),
    includeContent: z.boolean(),
    enabled: z.boolean(),
    maxPerHour: z.number().int().min(1).max(MAX_NOTIFICATION_HOURLY_LIMIT),
  })
  .strict();
export const notificationRuleCreateSchema = writable.extend({
  instanceId: writable.shape.instanceId.default(null),
  includeContent: z.boolean().default(false),
  enabled: z.boolean().default(true),
  maxPerHour: writable.shape.maxPerHour.default(DEFAULT_NOTIFICATION_HOURLY_LIMIT),
});
export const notificationRulePatchSchema = writable
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one change is required.',
  });
export const notificationRuleSchema = writable.extend({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  channel: notificationChannelSchema,
  recipientUserIds: recipients,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type NotificationRule = z.infer<typeof notificationRuleSchema>;
export type NotificationRuleCreate = z.input<typeof notificationRuleCreateSchema>;
export type NotificationRulePatch = z.infer<typeof notificationRulePatchSchema>;
export const notificationRuleResponseSchema = notificationRuleSchema
  .omit({ organizationId: true, projectId: true })
  .extend({ createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() })
  .strip();
export const notificationRecipientSchema = z
  .object({ id: membershipSchema.shape.userId, name: z.string(), email: z.email() })
  .strict();
export type NotificationRecipient = z.infer<typeof notificationRecipientSchema>;

export const MAX_NOTIFICATION_FIELDS = 50;
/** What a module lets a notification mail say about one event subject; values are plain text. */
export const notificationSubjectSchema = z
  .object({
    fields: z
      .array(z.object({ label: z.string().max(200), value: z.string().max(100_000) }).strict())
      .max(MAX_NOTIFICATION_FIELDS),
  })
  .strict();
export type NotificationSubject = z.infer<typeof notificationSubjectSchema>;
export type NotificationSubjectInput<I> = {
  eventType: string;
  subjectId: string;
  instance: I;
  /** Only rules with `include_content` receive field values; otherwise return `{ fields: [] }`. */
  includeContent: boolean;
};
