// Code samples for the landing page. They show the planned API (docs/ARCHITECTURE.md §D).
// Keep them in sync with the SDK once it exists.

export type CodeSample = { id: string; label: string; lang: string; code: string };

export const integrationSamples: readonly CodeSample[] = [
  {
    id: 'html',
    label: 'HTML form',
    lang: 'html',
    code: `<form method="post"
  action="https://backbricks.example.com/v1/public/forms/contact/submissions?key=bb_pk_…">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message"></textarea>
  <button>Send</button>
</form>`,
  },
  {
    id: 'sdk',
    label: 'TypeScript SDK',
    lang: 'ts',
    code: `import { createClient } from '@backbricks/sdk';

const backbricks = createClient({
  publishableKey: import.meta.env.PUBLIC_BACKBRICKS_KEY,
});

await backbricks.forms.submit('contact', { name, email, message });`,
  },
  {
    id: 'uploads',
    label: 'Uploads',
    lang: 'ts',
    code: `const cv = await backbricks.uploads.upload(file, {
  zone: 'cv',
  onProgress: (p) => setProgress(p.percent),
});

await backbricks.forms.submit('application', { name, email, cv: [cv.ref] });`,
  },
  {
    id: 'reviews',
    label: 'Reviews',
    lang: 'ts',
    code: `const { data: reviews } = await backbricks.reviews.list('testimonials', {
  sort: 'newest',
  limit: 6,
});

const stats = await backbricks.reviews.stats('testimonials');`,
  },
];
