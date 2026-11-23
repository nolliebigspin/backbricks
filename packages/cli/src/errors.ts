export const exit = { usage: 2, remote: 3, confirmation: 4, local: 5, diagnostic: 6 } as const;

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number = exit.usage,
    readonly details?: object,
  ) {
    super(message);
  }
}

export function safeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:[\]/~-]{1,160}$/.test(value)) return undefined;
  return value.includes('bb_sk_') ? undefined : value;
}

export const secretMarker = /bb_sk_[a-zA-Z0-9]+/;

export function redact(value: string) {
  return value.replace(/bb_sk_[a-zA-Z0-9]+/g, '[redacted]');
}
