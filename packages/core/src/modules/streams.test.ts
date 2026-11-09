import { expect, test } from 'bun:test';

import { createPagedTextStream } from './streams.ts';

test('paged streams prefetch at most one page and stop reading after cancellation', async () => {
  let calls = 0;
  const stream = createPagedTextStream(() => {
    calls++;
    return Promise.resolve({ text: 'row\r\n', nextCursor: String(calls) });
  }, 'header\r\n');
  const reader = stream.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('header\r\n');
  await Promise.resolve();
  expect(calls).toBeLessThanOrEqual(1);
  await reader.cancel();
  const stopped = calls;
  await Promise.resolve();
  expect(calls).toBe(stopped);
});

test('paged streams complete at EOF and propagate source failures without continuing', async () => {
  let calls = 0;
  const stream = createPagedTextStream(() => {
    calls++;
    return Promise.resolve({ text: 'row', nextCursor: null });
  }, '');
  expect(await new Response(stream).text()).toBe('row');
  expect(calls).toBe(1);
  const broken = new Response(
    createPagedTextStream(() => Promise.reject(new Error('source failed')), ''),
  );
  const error = await broken.text().catch((failure: unknown) => failure);
  expect(String(error)).toContain('source failed');
});
