import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../client.ts';
import { member, user } from '../schema/auth.generated.ts';

const recipient = z.object({ email: z.email() });
/** Identity-table exception: resolve current verified owner/admin recipients only at delivery time. */
export async function securityRecipients(db: Database, organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.role, ['owner', 'admin']),
        eq(user.emailVerified, true),
      ),
    );
  return [...new Set(rows.map((row) => recipient.parse(row).email))];
}
