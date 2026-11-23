import type { Challenge } from './pow.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shape check for challenges from the network; the solver validates the values. */
export function isChallenge(value: unknown): value is Challenge {
  if (!isRecord(value) || !isRecord(value['parameters'])) return false;
  const parameters = value['parameters'];
  return (
    ['algorithm', 'nonce', 'salt', 'keyPrefix'].every(
      (name) => typeof parameters[name] === 'string',
    ) && typeof parameters['cost'] === 'number'
  );
}
