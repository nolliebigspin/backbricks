/** One problem with one submitted field, e.g. `{ path: 'email', code: 'invalid_email' }`. */
export type FieldError = { path: string; code: string; message: string };

/**
 * Every failed SDK call throws this. `code` is the API's stable problem code (`validation_failed`,
 * `rate_limited`, …) or `network_error` when no response arrived; `fieldErrors` lists the fields
 * to fix and is empty for other problems.
 */
export class BackbricksError extends Error {
  override readonly name = 'BackbricksError';
  readonly code: string;
  /** HTTP status; 0 when the request never got a response. */
  readonly status: number;
  readonly fieldErrors: readonly FieldError[];
  /** Quote this when reporting a problem; `null` without a response. */
  readonly requestId: string | null;
  readonly hint: string | undefined;

  constructor(input: {
    code: string;
    status: number;
    message: string;
    fieldErrors?: readonly FieldError[];
    requestId?: string | null;
    hint?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.code = input.code;
    this.status = input.status;
    this.fieldErrors = input.fieldErrors ?? [];
    this.requestId = input.requestId ?? null;
    this.hint = input.hint;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const optionalText = (value: unknown) => (typeof value === 'string' ? value : undefined);

function fieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    isRecord(entry) && typeof entry['path'] === 'string' && typeof entry['code'] === 'string'
      ? [
          {
            path: entry['path'],
            code: entry['code'],
            message: optionalText(entry['message']) ?? '',
          },
        ]
      : [],
  );
}

/** Reads an RFC 9457 problem response; anything else still becomes a typed error. */
export async function errorFromResponse(response: Response): Promise<BackbricksError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const problem = isRecord(body) ? body : {};
  return new BackbricksError({
    code: optionalText(problem['code']) ?? 'http_error',
    status: response.status,
    message:
      optionalText(problem['detail']) ??
      optionalText(problem['title']) ??
      `Request failed with status ${response.status}.`,
    fieldErrors: fieldErrors(problem['errors']),
    requestId: optionalText(problem['requestId']) ?? response.headers.get('x-request-id'),
    hint: optionalText(problem['hint']),
  });
}

export const networkError = (cause: unknown) =>
  new BackbricksError({
    code: 'network_error',
    status: 0,
    message: 'Backbricks could not be reached.',
    cause,
  });
