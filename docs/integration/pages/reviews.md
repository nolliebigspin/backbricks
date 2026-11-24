---
title: Reviews
description: Collect reviews, moderate them in the dashboard, and show published ratings on your site.
---

Enable Reviews in your deployment and create a collection with key `testimonials` in the dashboard. Choose its rating scale and required fields. The examples use a five-point scale.

## Collect and publish a review

Use the [browser SDK client](/docs/forms#submit-with-the-sdk) with your publishable key and added website origin. The SDK handles the browser proof for submissions.

```ts
await backbricks.reviews.submit('testimonials', {
  rating: 5,
  authorName: 'Jamie Example',
});
```

In the dashboard, find the review in the collection's moderation queue. Approve it, then publish it. A review can be approved before you make it visible on the website.

## Display published reviews

```ts
const { data: reviews, nextCursor } = await backbricks.reviews.list('testimonials', {
  sort: 'newest',
  limit: 6,
});
const { count, average, distribution } = await backbricks.reviews.stats('testimonials');
```

Render review text as plain text in your components. The public API returns published reviews and aggregate ratings without the private fields used for moderation. To load more, pass `nextCursor` as `cursor` on the next list request with the same sort. An empty collection has a zero count and a `null` average.
