// Examples of the current public API and TypeScript SDK.

export type CodeSample = { id: string; label: string; lang: string; code: string };

export const integrationSamples: readonly CodeSample[] = [
  {
    id: 'html',
    label: 'HTML form',
    lang: 'html',
    code: `<form method="post"
  action="https://backbricks.example.com/v1/public/forms/contact/submissions?key=YOUR_PUBLISHABLE_KEY">
  <label>Name <input name="name" required></label>
  <label>Email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <label><input name="privacy" type="checkbox" required> I agree to be contacted.</label>
  <div hidden><input name="_gotcha" tabindex="-1" autocomplete="off"></div>
  <button type="submit">Send</button>
</form>`,
  },
  {
    id: 'sdk',
    label: 'TypeScript SDK',
    lang: 'ts',
    code: `import { createClient } from '@backbricks/sdk';

const backbricks = createClient({
  baseUrl: 'https://backbricks.example.com',
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
});

await backbricks.forms.submit('contact', {
  name, email, message, privacy: consentChecked,
});`,
  },
  {
    id: 'uploads',
    label: 'Uploads',
    lang: 'ts',
    code: `const upload = await backbricks.uploads.upload('cv', selectedFile);

await backbricks.forms.submit('application', {
  email,
  cv: [upload.fileRef],
});`,
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
