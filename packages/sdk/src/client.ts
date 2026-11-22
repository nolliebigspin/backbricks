import { createForms, type FormsClient } from './forms.ts';
import { createReviews, type ReviewsClient } from './reviews.ts';
import { createTransport, type ClientOptions } from './transport.ts';
import { createUploads, type UploadsClient } from './uploads.ts';

export type { ClientOptions } from './transport.ts';
export type Client<Schema> = {
  forms: FormsClient<Schema>;
  uploads: UploadsClient<Schema>;
  reviews: ReviewsClient<Schema>;
};

export function createClientFor<Schema>(options: ClientOptions): Client<Schema> {
  const transport = createTransport(options);
  return {
    forms: createForms<Schema>(transport),
    uploads: createUploads<Schema>(transport),
    reviews: createReviews<Schema>(transport),
  };
}
