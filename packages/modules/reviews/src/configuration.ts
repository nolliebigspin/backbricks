import {
  AppError,
  canonicalJson,
  sdkSchemaDeclaration,
  type ConfiguredInstance,
} from '@backbricks/core';

import { reviewsConfigSchema, type ReviewsConfig } from './config.ts';

export const defaultReviewsConfig = () => reviewsConfigSchema.parse({});

export const reviewTemplates = {
  'testimonials-en': { name: 'Testimonials', config: defaultReviewsConfig() },
  'testimonials-de': { name: 'Erfahrungsberichte', config: defaultReviewsConfig() },
};

export function classifyReviewsChange(previous: ReviewsConfig, next: ReviewsConfig) {
  if (previous.ratingScale !== next.ratingScale)
    throw new AppError('validation_failed', {
      errors: [
        {
          path: 'ratingScale',
          code: 'immutable',
          message: 'Choose the rating scale when creating a collection.',
        },
      ],
    });

  const changedPaths = reviewsConfigSchema
    .keyof()
    .options.filter(
      (field) => canonicalJson(previous[field] ?? null) !== canonicalJson(next[field] ?? null),
    );
  const fields = new Map(next.fields.map((field) => [field.key, field]));
  const before = new Map(previous.fields.map((field) => [field.key, field]));
  const fieldVisibilityChanged =
    previous.fields.some(
      (field) => !fields.has(field.key) || fields.get(field.key)?.public !== field.public,
    ) || next.fields.some((field) => field.public && !before.has(field.key));
  const displayExpanded =
    previous.authorDisplay === 'initials' && next.authorDisplay !== 'initials';
  const disclosureChanged = fieldVisibilityChanged || displayExpanded;
  const stricter =
    (!previous.titleRequired && next.titleRequired) ||
    (!previous.bodyRequired && next.bodyRequired) ||
    (!previous.emailRequired && next.emailRequired) ||
    next.titleMaxLength < previous.titleMaxLength ||
    next.bodyMaxLength < previous.bodyMaxLength ||
    next.fields.some((field) => field.required && !before.get(field.key)?.required);
  return {
    changedPaths,
    destructive: disclosureChanged,
    warnings: [
      ...(stricter ? ['Existing integrations may need to update their review fields.'] : []),
      ...(disclosureChanged ? ['Public review fields may change for existing reviews.'] : []),
      ...(next.retentionDays === null ? ['Reviews are kept without a time limit.'] : []),
    ],
  };
}

export function reviewsCodegen(instance: ConfiguredInstance<ReviewsConfig>) {
  const { config } = instance;
  const ratings = Array.from({ length: config.ratingScale }, (_, index) => index + 1).join(' | ');
  const fields = [
    `rating: ${ratings}`,
    'authorName: string',
    `title${config.titleRequired ? '' : '?'}: string`,
    `body${config.bodyRequired ? '' : '?'}: string`,
    `email${config.emailRequired ? '' : '?'}: string`,
  ];
  if (config.fields.length) {
    const extra = config.fields.map(
      (field) => `${JSON.stringify(field.key)}${field.required ? '' : '?'}: string`,
    );
    fields.push(
      `fields${config.fields.some((field) => field.required) ? '' : '?'}: { ${extra.join('; ')} }`,
    );
  }
  return sdkSchemaDeclaration('review-collections', instance.key, `{ ${fields.join('; ')} }`);
}
