import { redactSecrets } from '../logging/redact.ts';
import { ERROR_CODES, ERROR_TYPE_BASE_URL, type ErrorCode, type ErrorStatus } from './codes.ts';
import { problemDetailsSchema, type FieldError, type ProblemDetails } from './schema.ts';

export type { FieldError, ProblemDetails } from './schema.ts';

export type AppErrorOptions = {
  /** Human-readable explanation of this occurrence. Never put secrets or personal data here. */
  detail?: string;
  errors?: FieldError[];
  /** What the caller (often an agent) can do next. */
  hint?: string;
};

/** The only error type routes and services throw for expected failures (AGENTS.md §5). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;
  readonly detail?: string;
  readonly errors?: FieldError[];
  readonly hint?: string;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.detail ?? ERROR_CODES[code].title);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.detail = options.detail;
    this.errors = options.errors;
    this.hint = options.hint;
  }
}

export function toProblemDetails(error: AppError, requestId: string): ProblemDetails {
  return problemDetailsSchema.parse(
    redactSecrets({
      type: `${ERROR_TYPE_BASE_URL}${error.code}`,
      title: ERROR_CODES[error.code].title,
      status: error.status,
      code: error.code,
      ...(error.detail === undefined ? {} : { detail: error.detail }),
      ...(error.errors === undefined ? {} : { errors: error.errors }),
      ...(error.hint === undefined ? {} : { hint: error.hint }),
      requestId,
    }),
  );
}
