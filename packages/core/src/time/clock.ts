/** Source of the current time. Domain code takes a Clock instead of calling Date.now() (AGENTS.md §5). */
export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };
