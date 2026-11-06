import { z } from 'zod';

import { mailMessageSchema } from '../mail/contract.ts';
import { activityIdentifierSchema } from '../platform/activity-fields.ts';

export const MAIL_JOB_NAME = 'core.mail.deliver';
export const MAIL_JOB_RETENTION_SECONDS = 24 * 60 * 60;
export const mailDeliverySchema = z
  .object({
    message: mailMessageSchema,
    expiresAt: z.iso.datetime(),
    securityOrganizationId: activityIdentifierSchema.optional(),
  })
  .strict();
export const systemJobPayloadSchema = z.object({}).strict();
