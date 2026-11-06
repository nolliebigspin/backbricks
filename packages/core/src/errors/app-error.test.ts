import { describe, expect, test } from 'bun:test';

import { AppError, toProblemDetails } from './app-error.ts';
import { problemDetailsSchema } from './schema.ts';

describe('AppError → problem details (RFC 9457)', () => {
  test('takes status and title from the catalog', () => {
    const error = new AppError('validation_failed', {
      detail: '1 field is invalid.',
      errors: [{ path: 'email', code: 'invalid_email', message: 'Must be a valid email address.' }],
      hint: 'Fetch the form schema first.',
    });
    expect(toProblemDetails(error, 'req_1')).toEqual({
      type: 'https://backbricks.app/errors/validation_failed',
      title: 'Validation failed',
      status: 422,
      code: 'validation_failed',
      detail: '1 field is invalid.',
      errors: [{ path: 'email', code: 'invalid_email', message: 'Must be a valid email address.' }],
      hint: 'Fetch the form schema first.',
      requestId: 'req_1',
    });
  });

  test('omits optional members that are not set', () => {
    expect(Object.keys(toProblemDetails(new AppError('not_found'), 'req_2'))).toEqual([
      'type',
      'title',
      'status',
      'code',
      'requestId',
    ]);
  });

  test('the documented error contract accepts the wire payload and rejects private extras', () => {
    const payload = toProblemDetails(
      new AppError('validation_failed', {
        errors: [{ path: 'name', code: 'invalid_type', message: 'Invalid value.' }],
      }),
      'req_contract',
    );
    expect(problemDetailsSchema.parse(payload)).toEqual(payload);
    expect(problemDetailsSchema.safeParse({ ...payload, stack: 'internal detail' }).success).toBe(
      false,
    );
    expect(problemDetailsSchema.safeParse({ ...payload, status: 499 }).success).toBe(false);
    expect(problemDetailsSchema.safeParse({ ...payload, code: 'uncatalogued_error' }).success).toBe(
      false,
    );
  });
});
