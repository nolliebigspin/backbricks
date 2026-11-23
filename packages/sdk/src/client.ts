import { createForms, type FormsClient } from './forms.ts';
import { createReviews, type ReviewsClient } from './reviews.ts';
import { createTransport, type ClientOptions, type RequestOptions } from './transport.ts';
import { createUploads, type UploadsClient } from './uploads.ts';

export type { ClientOptions } from './transport.ts';
export type Client<Schema> = {
  forms: FormsClient<Schema>;
  uploads: UploadsClient<Schema>;
  reviews: ReviewsClient<Schema>;
  /** Request a JSON endpoint under the configured API version. Bodyless responses return undefined. */
  request<T = unknown>(path: string, options?: RequestOptions): Promise<T | undefined>;
};

export function createClientFor<Schema>(options: ClientOptions): Client<Schema> {
  const transport = createTransport(options);
  return {
    forms: createForms<Schema>(transport),
    uploads: createUploads<Schema>(transport),
    reviews: createReviews<Schema>(transport),
    async request<T>(path: string, requestOptions?: RequestOptions) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The caller supplies the generic type for an arbitrary JSON endpoint.
      return (await transport.request(path, requestOptions)) as T | undefined;
    },
  };
}
