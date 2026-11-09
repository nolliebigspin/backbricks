/** Bounded polling for real asynchronous services; no arbitrary fixed delay in the assertion path. */
export async function eventually(condition: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- The next observation depends on the previous state.
    if (await condition()) return;
    // oxlint-disable-next-line no-await-in-loop -- Yield between real service observations.
    await Bun.sleep(25);
  }
  throw new Error('Expected service state did not become true.');
}
