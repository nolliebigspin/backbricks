import { expect, test } from 'bun:test';

import { reviewsConfigSchema } from './index.ts';
import { validateReview } from './validation.ts';

test('collections default to five-point manual moderation and validate private and public fields', () => {
  const config = reviewsConfigSchema.parse({
    emailRequired: true,
    fields: [
      { key: 'company', label: 'Company', public: true },
      { key: 'reference', label: 'Reference' },
    ],
  });
  expect(config).toMatchObject({ ratingScale: 5, moderation: 'manual', retentionDays: 180 });
  expect(
    validateReview(config, {
      rating: 5,
      authorName: ' Ada Lovelace ',
      email: 'ADA@EXAMPLE.COM',
      fields: { company: ' Example ', reference: 'private' },
    }),
  ).toMatchObject({
    authorName: 'Ada Lovelace',
    subjectEmail: 'ada@example.com',
    publicFields: { company: 'Example' },
    privateFields: { reference: 'private' },
  });
  expect(() =>
    validateReview(config, {
      rating: 6,
      authorName: 'Ada',
      email: 'ada@example.com',
      fields: { unknown: 'value' },
    }),
  ).toThrow();
});

test('extra fields are unique and honor requiredness and configured text limits', () => {
  const config = reviewsConfigSchema.parse({
    titleRequired: true,
    titleMaxLength: 4,
    fields: [{ key: 'company', label: 'Company', required: true }],
  });
  expect(
    reviewsConfigSchema.safeParse({ fields: [config.fields[0], config.fields[0]] }).success,
  ).toBe(false);
  expect(reviewsConfigSchema.safeParse({ ratingScale: 11 }).success).toBe(false);
  expect(() =>
    validateReview(config, { rating: 1, authorName: 'Åsa', title: 'Long title' }),
  ).toThrow();
  expect(
    validateReview(config, {
      rating: 1,
      authorName: 'Åsa',
      title: 'Hej',
      fields: { company: 'Å AB' },
    }).privateFields,
  ).toEqual({ company: 'Å AB' });
});
