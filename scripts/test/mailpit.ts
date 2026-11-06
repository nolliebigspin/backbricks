import { z } from 'zod';

export const TEST_SMTP_URL = process.env['TEST_SMTP_URL'] ?? 'smtp://127.0.0.1:1025';
const baseUrl = process.env['TEST_MAILPIT_URL'] ?? 'http://127.0.0.1:8025';
const localHosts = new Set(['127.0.0.1', 'localhost', 'mailpit', '[::1]']);
if (
  !localHosts.has(new URL(baseUrl).hostname) ||
  !localHosts.has(new URL(TEST_SMTP_URL).hostname)
) {
  throw new Error('Mailpit tests must use a local test service, never a live SMTP provider.');
}

const summarySchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const messageSchema = z.object({
  ID: z.string(),
  Subject: z.string(),
  HTML: z.string(),
  Text: z.string(),
  To: z.array(z.object({ Address: z.string() })),
});

export async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/messages?limit=1`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) throw new Error();
    return true;
  } catch {
    if (process.env['CI']) throw new Error('Mailpit is not reachable; run mise run infra.');
    return false;
  }
}

/** Search only the test's unique recipient; never clear another session's mailbox. */
export async function receivedMail(
  recipient: string,
  attempt = 0,
  subject?: string,
): Promise<z.infer<typeof messageSchema>> {
  const query = new URLSearchParams({
    query: `to:${recipient}${subject ? ` subject:${subject}` : ''}`,
  });
  const response = await fetch(`${baseUrl}/api/v1/search?${query.toString()}`);
  const result = summarySchema.parse(await response.json());
  const id = result.messages[0]?.ID;
  if (id)
    return messageSchema.parse(
      await (await fetch(`${baseUrl}/api/v1/message/${encodeURIComponent(id)}`)).json(),
    );
  if (attempt >= 20) throw new Error('Expected test mail was not received.');
  await Bun.sleep(50);
  return receivedMail(recipient, attempt + 1, subject);
}
