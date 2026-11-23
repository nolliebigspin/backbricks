import { AppError, type FieldError } from '@backbricks/core';
import type { z } from 'zod';

import type { ReviewsConfig } from './config.ts';
import { REVIEW_LIMITS as limits } from './constants.ts';
import { reviewBodySchema } from './submission-schema.ts';

export function validateReview(config: ReviewsConfig, input: z.output<typeof reviewBodySchema>) {
  const { rating, authorName, title, body, email, fields = {} } = reviewBodySchema.parse(input);
  const errors: FieldError[] = [];
  if (rating > config.ratingScale)
    errors.push({
      path: 'rating',
      code: 'out_of_range',
      message: 'Rating exceeds the collection scale.',
    });
  for (const [name, value, required, max] of [
    ['title', title, config.titleRequired, config.titleMaxLength],
    ['body', body, config.bodyRequired, config.bodyMaxLength],
    ['email', email, config.emailRequired, undefined],
  ] as const) {
    if (required && value === undefined)
      errors.push({ path: name, code: 'required', message: 'This field is required.' });
    if (value !== undefined && max !== undefined && value.length > max)
      errors.push({
        path: name,
        code: 'too_long',
        message: 'This field exceeds its length limit.',
      });
  }
  const declarations = new Map(config.fields.map((field) => [field.key, field]));
  const publicFields: Record<string, string> = {};
  const privateFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const field = declarations.get(key);
    if (!field)
      errors.push({
        path: 'fields',
        code: 'unknown_field',
        message: 'An extra field is undeclared.',
      });
    else (field.public ? publicFields : privateFields)[key] = value;
  }
  for (const field of config.fields) {
    if (field.required && !Object.hasOwn(fields, field.key))
      errors.push({
        path: `fields.${field.key}`,
        code: 'required',
        message: 'This field is required.',
      });
  }
  if (errors.length)
    throw new AppError('validation_failed', { errors: errors.slice(0, limits.fieldCount) });
  return {
    rating,
    authorName,
    title: title ?? null,
    body: body ?? null,
    subjectEmail: email ?? null,
    publicFields,
    privateFields,
  };
}
