import { ERROR_CODES, ERROR_TYPE_BASE_URL, type ErrorCode, type ErrorStatus } from './codes.ts';

/** One invalid field or parameter in a `validation_failed` problem. */
export type FieldError = {
  path: string;
  code: string;
  message: string;
  meta?: Record<string, unknown>;
};

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

/** RFC 9457 problem details with the agent-friendly extensions from ARCHITECTURE §D.3. */
export type ProblemDetails = {
  type: string;
  title: string;
  status: ErrorStatus;
  code: ErrorCode;
  detail?: string;
  errors?: FieldError[];
  hint?: string;
  requestId: string;
};

export function toProblemDetails(error: AppError, requestId: string): ProblemDetails {
  return {
    type: `${ERROR_TYPE_BASE_URL}${error.code}`,
    title: ERROR_CODES[error.code].title,
    status: error.status,
    code: error.code,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    ...(error.errors === undefined ? {} : { errors: error.errors }),
    ...(error.hint === undefined ? {} : { hint: error.hint }),
    requestId,
  };
}
