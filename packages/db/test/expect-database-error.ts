import { expect } from 'bun:test';

/** Drizzle queries are lazy thenables; await execution before checking the driver's SQLSTATE. */
export async function expectDatabaseError(
  query: PromiseLike<unknown>,
  code: string,
): Promise<void> {
  let failure: unknown;
  try {
    await query;
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ cause: { code } });
}
