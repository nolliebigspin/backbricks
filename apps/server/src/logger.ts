import { redactSecrets } from '@backbricks/core';
import { type DestinationStream, type Logger, pino } from 'pino';

export type { Logger };

/**
 * Structured JSON logs (pino). Sanitize the final JSON boundary, including child bindings,
 * serializer output and formatted message strings, before any transport receives a line (I4).
 * For readable local output, pipe through `bunx pino-pretty`.
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'backbricks' },
      formatters: {
        level: (label) => ({ level: label }),
      },
      hooks: {
        streamWrite: (line) => `${JSON.stringify(redactSecrets(JSON.parse(line)))}\n`,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
