/** Per-rule delivery throttle state, stored with the rule and changed only inside a delivery job. */
export type NotificationThrottle = {
  /** Start of the hour the `sent` count belongs to. */
  windowStart: Date | null;
  sent: number;
  /** Entries not mailed individually since the last digest. */
  suppressed: number;
};
export type ThrottleDecision = {
  state: NotificationThrottle;
  action: 'send' | 'suppress';
  /** Set when this suppression starts a new digest; the digest runs at the end of the hour. */
  digestAt?: Date;
};

export const NOTIFICATION_THROTTLE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Fixed hourly windows: the first `maxPerHour` entries are mailed, later ones are counted for one
 * content-free digest. Suppressions accumulate until a digest takes them, so none is ever lost.
 */
export function throttleDecision(
  current: NotificationThrottle,
  maxPerHour: number,
  now: Date,
): ThrottleDecision {
  const start = Math.floor(now.getTime() / NOTIFICATION_THROTTLE_WINDOW_MS);
  const windowStart = new Date(start * NOTIFICATION_THROTTLE_WINDOW_MS);
  const sent = current.windowStart?.getTime() === windowStart.getTime() ? current.sent : 0;
  if (sent < maxPerHour)
    return { state: { ...current, windowStart, sent: sent + 1 }, action: 'send' };
  return {
    state: { windowStart, sent, suppressed: current.suppressed + 1 },
    action: 'suppress',
    ...(current.suppressed === 0
      ? { digestAt: new Date(windowStart.getTime() + NOTIFICATION_THROTTLE_WINDOW_MS) }
      : {}),
  };
}
