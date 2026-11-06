import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import {
  MAX_USAGE_VALUE,
  monthlyUsagePeriod,
  usageIncrementSchema,
  usagePeriodSchema,
} from '../index.ts';

test('usage month boundaries use UTC rather than the host or supplied offset', () => {
  expect(monthlyUsagePeriod(new Date('2026-12-01T00:30:00+01:00'))).toBe('2026-11-01');
  expect(monthlyUsagePeriod(new Date('2026-11-30T23:30:00-01:00'))).toBe('2026-12-01');
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 2_000_000_000_000 }), (time) => {
      expect(usagePeriodSchema.safeParse(monthlyUsagePeriod(new Date(time))).success).toBe(true);
    }),
  );
});

test('usage requires a valid month start, namespaced metric and positive lossless amount', () => {
  for (const period of ['2026-11', '2026-11-02', '2026-13-01', '2026-02-30', 'yesterday'])
    expect(usagePeriodSchema.safeParse(period).success).toBe(false);
  expect(
    usageIncrementSchema.parse({ metric: 'uploads.bytes_ingested', delta: MAX_USAGE_VALUE }).delta,
  ).toBe(MAX_USAGE_VALUE);
  for (const input of [
    { metric: 'counter', delta: 1n },
    { metric: 'forms.submissions', delta: -1n },
    { metric: 'forms.submissions', delta: 0n },
    { metric: 'forms.submissions', delta: 1 },
    { metric: 'forms.submissions', delta: MAX_USAGE_VALUE + 1n },
  ])
    expect(usageIncrementSchema.safeParse(input).success).toBe(false);
});
