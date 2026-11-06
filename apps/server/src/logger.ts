import { redactFields } from '@backbricks/core';
import { type DestinationStream, type Logger, pino } from 'pino';

export type { Logger };

/**
 * Structured JSON logs (pino). Every log object passes through `redactFields`, so secrets
 * never reach the output even if a caller logs a whole header or config object (I4).
 * For readable local output, pipe through `bunx pino-pretty`.
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'backbricks' },
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => redactFields(object),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
