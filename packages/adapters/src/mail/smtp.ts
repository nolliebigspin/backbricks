import { AppError, mailMessageSchema, type Config, type Mailer } from '@backbricks/core';
import { createTransport } from 'nodemailer';

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 15_000;
const SMTP_PORT = 587;
const SMTPS_PORT = 465;

/** SMTP adapter with bounded I/O and no provider diagnostics containing recipients or tokens. */
export function createSmtpMailer(config: NonNullable<Config['mailer']>): Mailer {
  let url: URL;
  let user: string;
  let pass: string;
  try {
    url = new URL(config.smtpUrl);
    if (
      !['smtp:', 'smtps:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      (url.pathname && url.pathname !== '/')
    )
      throw new Error();
    user = decodeURIComponent(url.username);
    pass = decodeURIComponent(url.password);
    if (pass && !user) throw new Error();
    if (!mailMessageSchema.shape.to.safeParse(config.from).success) throw new Error();
  } catch {
    throw new AppError('service_unavailable', { detail: 'SMTP_URL is invalid.' });
  }
  const transport = createTransport({
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'smtps:' ? SMTPS_PORT : SMTP_PORT,
    secure: url.protocol === 'smtps:',
    requireTLS: Boolean(user) && url.protocol !== 'smtps:',
    tls: { minVersion: 'TLSv1.2' },
    auth: user ? { user, pass } : undefined,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
  return {
    async send(input) {
      const parsed = mailMessageSchema.safeParse(input);
      if (!parsed.success) throw new AppError('internal_error');
      const message = parsed.data;
      try {
        const result = await transport.sendMail({ from: config.from, ...message });
        if (result.rejected.length > 0 || result.accepted.length !== 1) throw new Error();
      } catch {
        throw new AppError('service_unavailable', { detail: 'Email delivery failed.' });
      }
    },
    async close() {
      transport.close();
    },
  };
}
