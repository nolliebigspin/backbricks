import { z } from 'zod';

export const MAIL_BODY_LIMIT = 64 * 1024;
/** One recipient per delivery, so retries cannot accidentally redisclose a recipient list. */
export const mailMessageSchema = z
  .object({
    to: z.email(),
    subject: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => !/[\r\n\0]/.test(value)),
    text: z.string().min(1).max(MAIL_BODY_LIMIT),
    html: z.string().min(1).max(MAIL_BODY_LIMIT),
  })
  .strict();
export type MailMessage = z.infer<typeof mailMessageSchema>;

/** SMTP/provider capability. Call only after commit, or from a durable delivery job. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
  close(): Promise<void>;
}
