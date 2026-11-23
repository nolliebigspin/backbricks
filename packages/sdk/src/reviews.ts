import type { operations } from '@backbricks/api-contract';

import { unexpectedResponse } from './errors.ts';
import { submitPublicData, type SubmitOptions } from './public-submit.ts';
import type { Transport } from './transport.ts';

type ListOperation = operations['reviews.public.list'];
type SubmitOperation = operations['reviews.public.submit'];
type Body = SubmitOperation['requestBody']['content']['application/json']['data'];
export type ReviewPage = ListOperation['responses'][200]['content']['application/json'];
export type ReviewStats =
  operations['reviews.public.stats']['responses'][200]['content']['application/json'];
export type ReviewReceipt = SubmitOperation['responses'][200]['content']['application/json'];
export type ReviewValues<
  Schema,
  Key extends string,
> = `review-collections/${Key}` extends keyof Schema ? Schema[`review-collections/${Key}`] : Body;
export type ReviewListOptions = Omit<NonNullable<ListOperation['parameters']['query']>, 'key'> & {
  signal?: AbortSignal;
};

export type ReviewsClient<Schema> = {
  list(key: string, options?: ReviewListOptions): Promise<ReviewPage>;
  stats(key: string, options?: { signal?: AbortSignal }): Promise<ReviewStats>;
  submit<Key extends string>(
    key: Key,
    data: ReviewValues<Schema, Key>,
    options?: SubmitOptions,
  ): Promise<ReviewReceipt>;
};

const collection = (key: string) => `/public/review-collections/${encodeURIComponent(key)}`;

function isPage(value: unknown): value is ReviewPage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray(value.data) &&
    'nextCursor' in value &&
    (value.nextCursor === null || typeof value.nextCursor === 'string')
  );
}
function isStats(value: unknown): value is ReviewStats {
  return (
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    typeof value.count === 'number' &&
    'ratingScale' in value &&
    typeof value.ratingScale === 'number' &&
    'average' in value &&
    (value.average === null || typeof value.average === 'number') &&
    'distribution' in value &&
    Array.isArray(value.distribution)
  );
}

export function createReviews<Schema>(transport: Transport): ReviewsClient<Schema> {
  return {
    async list(key, { sort, limit, cursor, signal } = {}) {
      const query = new URLSearchParams();
      if (sort !== undefined) query.set('sort', sort);
      if (limit !== undefined) query.set('limit', String(limit));
      if (cursor !== undefined) query.set('cursor', cursor);
      const search = query.toString();
      const value = await transport.request(
        `${collection(key)}/reviews${search ? `?${search}` : ''}`,
        { method: 'GET' },
        signal,
      );
      if (!isPage(value)) throw unexpectedResponse();
      return value;
    },
    async stats(key, { signal } = {}) {
      const value = await transport.request(`${collection(key)}/stats`, { method: 'GET' }, signal);
      if (!isStats(value)) throw unexpectedResponse();
      return value;
    },
    submit: (key, data, options) =>
      submitPublicData(transport, `${collection(key)}/reviews`, data, options),
  };
}
