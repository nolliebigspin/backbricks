import { expect } from 'bun:test';

/** Drizzle queries are lazy thenables; await execution before checking the driver's SQLSTATE. */
export function expectDatabaseError(query: PromiseLike<unknown>, code: string): Promise<void> {
  return expectFailure(query, { cause: { code } });
}

/** Assert the actual asynchronous rejection, including safe domain and lifetime errors. */
export async function expectFailure(
  query: PromiseLike<unknown>,
  expected: Record<string, unknown>,
): Promise<void> {
  let failure: unknown;
  try {
    await query;
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject(expected);
}
