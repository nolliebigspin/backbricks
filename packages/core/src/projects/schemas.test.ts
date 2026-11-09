import { expect, test } from 'bun:test';

import { projectCreateSchema, projectPatchSchema } from '../index.ts';

test('project inputs derive defaults and canonical origins without accepting authority fields', () => {
  expect(projectCreateSchema.parse({ name: ' Website ', slug: 'my-website' })).toEqual({
    name: 'Website',
    slug: 'my-website',
    allowedOrigins: [],
    settings: {},
  });
  expect(projectPatchSchema.parse({ allowedOrigins: ['HTTPS://EXAMPLE.COM:443'] })).toEqual({
    allowedOrigins: ['https://example.com'],
  });
  for (const field of ['id', 'organizationId', 'projectId', 'createdAt', 'updatedAt', 'deletedAt'])
    expect(
      projectCreateSchema.safeParse({ name: 'Website', slug: 'website', [field]: 'forged' })
        .success,
    ).toBe(false);
});

test('project inputs reject empty patches, invalid names/slugs and undefined settings', () => {
  for (const slug of ['', '-website', 'website-', 'my_website', 'My-Website', 'x'.repeat(64)])
    expect(projectCreateSchema.safeParse({ name: 'Website', slug }).success).toBe(false);
  for (const value of [
    {},
    { name: ' ' },
    { name: 'x'.repeat(121) },
    { name: null },
    { settings: { unimplemented: true } },
    { allowedOrigins: null },
    { deletedAt: null },
  ])
    expect(projectPatchSchema.safeParse(value).success).toBe(false);
});
