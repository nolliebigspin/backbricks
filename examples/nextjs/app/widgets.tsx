'use client';

import { BackbricksError, createClient, type ReviewPage } from '@backbricks/sdk';
import { useEffect, useMemo, useState } from 'react';

import { browserOptions } from './browser.config.ts';

const ratings = [1, 2, 3, 4, 5] as const;

function textField(values: FormData, name: string) {
  const value = values.get(name);
  return typeof value === 'string' ? value : '';
}

export function ContactAndReviews() {
  const { baseUrl, publishableKey } = browserOptions();
  const client = useMemo(
    () => (baseUrl && publishableKey ? createClient({ baseUrl, publishableKey }) : null),
    [baseUrl, publishableKey],
  );
  const [contactStatus, setContactStatus] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [reviews, setReviews] = useState<ReviewPage['data']>([]);

  useEffect(() => {
    if (!client) return undefined;
    const controller = new AbortController();
    void client.reviews.list('testimonials', { signal: controller.signal }).then(
      (page) => setReviews(page.data),
      () => {
        if (!controller.signal.aborted) setReviewStatus('Could not load reviews.');
      },
    );
    return () => controller.abort();
  }, [client]);

  if (!client) return <p>Link this site with the Backbricks CLI to enable submissions.</p>;
  return (
    <>
      <section>
        <h2>Contact</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            const cv = values.get('cv');
            if (!(cv instanceof File) || cv.size === 0 || !values.has('privacy')) return;
            setContactStatus('Uploading your CV…');
            void (async () => {
              const file = await client.uploads.upload('cv', cv);
              await client.forms.submit('contact', {
                name: textField(values, 'name'),
                email: textField(values, 'email'),
                message: textField(values, 'message'),
                privacy: true,
                cv: [file.fileRef],
              });
              setContactStatus('Message sent.');
              form.reset();
            })().catch((error: unknown) =>
              setContactStatus(
                error instanceof BackbricksError ? error.message : 'Could not send the form.',
              ),
            );
          }}
        >
          <label>
            Name <input name="name" required />
          </label>
          <label>
            Email <input name="email" type="email" required />
          </label>
          <label>
            Message <textarea name="message" required />
          </label>
          <label>
            CV (PDF) <input name="cv" type="file" accept="application/pdf" required />
          </label>
          <label>
            <input name="privacy" type="checkbox" required /> I agree to the privacy notice.
          </label>
          <button type="submit">Send contact form</button>
        </form>
        <output aria-live="polite">{contactStatus}</output>
      </section>
      <section>
        <h2>Testimonials</h2>
        <ul>
          {reviews.map((review) => (
            <li key={review.id}>
              {review.displayName} · {review.rating} · {review.body}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const rating = ratings.find((score) => score === Number(values.get('rating')));
            if (!rating) return;
            void client.reviews
              .submit('testimonials', {
                authorName: textField(values, 'author'),
                rating,
                body: textField(values, 'review'),
              })
              .then(
                () => setReviewStatus('Review sent for moderation.'),
                () => setReviewStatus('Could not send the review.'),
              );
          }}
        >
          <label>
            Reviewer name <input name="author" required />
          </label>
          <label>
            Rating <input name="rating" type="number" min="1" max="5" required />
          </label>
          <label>
            Review <textarea name="review" required />
          </label>
          <button type="submit">Send review</button>
        </form>
        <output aria-live="polite">{reviewStatus}</output>
      </section>
    </>
  );
}
