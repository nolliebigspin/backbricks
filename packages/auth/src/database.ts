import { drizzleAdapter } from '@better-auth/drizzle-adapter';

/** Bind the pinned adapter to the caller's connection/transaction and db-owned auth schema. */
export function bindAuthDatabase(
  connection: Parameters<typeof drizzleAdapter>[0],
  schema: NonNullable<Parameters<typeof drizzleAdapter>[1]['schema']>,
) {
  return drizzleAdapter(connection, { provider: 'pg', schema, transaction: true });
}
