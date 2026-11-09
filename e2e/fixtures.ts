import { createHash, randomUUID } from 'node:crypto';

import { test as base } from '@playwright/test';

/** Dedicated synthetic addresses are trusted only by the local E2E server's explicit proxy config. */
export function testHeaders(seed: string = randomUUID()) {
  const digest = createHash('sha256').update(seed).digest();
  return { 'x-forwarded-for': `198.18.${digest[0]}.${digest[1]}` };
}
export const test = base.extend({
  extraHTTPHeaders: async ({ baseURL }, use, info) => {
    await use(testHeaders(`${info.testId}:${baseURL}`));
  },
});
export { expect } from '@playwright/test';
