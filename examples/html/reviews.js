import { BackbricksError, createClient } from '@backbricks/sdk';

const backbricks = createClient({
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
  baseUrl: 'http://localhost:5173/v1',
});
const collection = 'testimonials';
const form = document.querySelector('#review-form');
const response = form.querySelector('output');
const list = document.querySelector('#published-reviews');
const summary = document.querySelector('#review-stats');
const more = document.querySelector('#more-reviews');
const send = form.querySelector('button[type=submit]');
let nextCursor;

function showError(target, error) {
  target.textContent =
    error instanceof BackbricksError
      ? error.fieldErrors.map(({ path, message }) => `${path}: ${message}`).join(' ') ||
        error.message
      : 'Please try again.';
}

function renderReview(review) {
  const item = document.createElement('li');
  const title = document.createElement('strong');
  title.textContent = review.title ?? 'Review';
  const text = document.createElement('p');
  text.textContent = review.body ?? '';
  const byline = document.createElement('p');
  byline.textContent = `${review.displayName} · ${review.rating}`;
  item.append(title, text, byline);
  list.append(item);
}

async function loadReviews() {
  more.disabled = true;
  try {
    const { data, nextCursor: cursor } = await backbricks.reviews.list(collection, {
      limit: 10,
      cursor: nextCursor,
    });
    for (const review of data) renderReview(review);
    nextCursor = cursor ?? undefined;
    more.hidden = nextCursor === undefined;
  } catch (error) {
    showError(summary, error);
  } finally {
    more.disabled = false;
  }
}

more.addEventListener('click', () => void loadReviews());
async function loadStats() {
  try {
    const stats = await backbricks.reviews.stats(collection);
    form.elements.namedItem('rating').max = stats.ratingScale;
    summary.textContent =
      stats.count === 0
        ? 'No published reviews yet.'
        : `${stats.count} published ${stats.count === 1 ? 'review' : 'reviews'} · ${stats.average} / ${stats.ratingScale}`;
  } catch (error) {
    showError(summary, error);
  }
}
void loadStats();
void loadReviews();

async function submitReview() {
  const fields = new FormData(form);
  const text = (name) => fields.get(name) || undefined;
  send.disabled = true;
  try {
    await backbricks.reviews.submit(
      collection,
      {
        rating: Number(text('rating')),
        authorName: text('authorName'),
        email: text('email'),
        title: text('title'),
        body: text('body'),
      },
      { honeypot: text('_gotcha') },
    );
    form.reset();
    response.textContent = 'Thank you. Your review is awaiting moderation.';
  } catch (error) {
    showError(response, error);
  } finally {
    send.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitReview();
});
