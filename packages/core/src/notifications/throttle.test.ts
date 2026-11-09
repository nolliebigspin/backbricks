import { describe, expect, test } from 'bun:test';

import * as fc from 'fast-check';

import {
  NOTIFICATION_THROTTLE_WINDOW_MS,
  throttleDecision,
  type NotificationThrottle,
} from './throttle.ts';

const hour = new Date('2026-11-09T08:00:00Z');
const at = (minutes: number) => new Date(hour.getTime() + minutes * 60_000);
const empty: NotificationThrottle = { windowStart: null, sent: 0, suppressed: 0 };

describe('notification throttle', () => {
  test('mails the first N per hour, then schedules exactly one digest at the end of the hour', () => {
    let state = empty;
    const actions: string[] = [];
    const digests: Date[] = [];
    for (let index = 0; index < 13; index++) {
      const decision = throttleDecision(state, 10, at(index));
      state = decision.state;
      actions.push(decision.action);
      if (decision.digestAt) digests.push(decision.digestAt);
    }
    expect(actions.filter((action) => action === 'send')).toHaveLength(10);
    expect(actions[10]).toBe('suppress');
    expect(state).toEqual({ windowStart: hour, sent: 10, suppressed: 3 });
    expect(digests).toEqual([new Date(hour.getTime() + NOTIFICATION_THROTTLE_WINDOW_MS)]);
  });

  test('a new hour resets the mail count but keeps undigested suppressions', () => {
    const next = throttleDecision({ windowStart: hour, sent: 10, suppressed: 2 }, 10, at(61));
    expect(next.action).toBe('send');
    expect(next.state).toEqual({ windowStart: at(60), sent: 1, suppressed: 2 });
    expect(next.digestAt).toBeUndefined();
  });

  test('never loses an entry: every decision either sends or counts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 600 }), { maxLength: 200 }),
        fc.integer({ min: 1, max: 100 }),
        (offsets, limit) => {
          let state = empty;
          let sent = 0;
          for (const minutes of offsets.toSorted((a, b) => a - b)) {
            const decision = throttleDecision(state, limit, at(minutes));
            if (decision.action === 'send') sent++;
            state = decision.state;
            expect(state.sent).toBeLessThanOrEqual(limit);
          }
          expect(sent + state.suppressed).toBe(offsets.length);
        },
      ),
    );
  });
});
