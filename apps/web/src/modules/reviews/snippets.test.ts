import { expect, test } from 'bun:test';

import { reviewSubmitExample } from './snippets.ts';

test('review embed samples satisfy the collection’s required fields and short text limits', () => {
  expect(
    reviewSubmitExample({
      titleRequired: true,
      bodyRequired: true,
      bodyMaxLength: 2,
      titleMaxLength: 1,
      fields: [
        { key: 'company', required: true },
        { key: 'optional', required: false },
      ],
    }),
  ).toEqual({
    rating: 1,
    authorName: 'Ada Lovelace',
    title: 'H',
    body: 'Th',
    fields: { company: 'Example' },
  });
});
