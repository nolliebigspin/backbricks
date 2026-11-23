import { BackbricksError, createClient } from '@backbricks/sdk';

const ratings = [1, 2, 3, 4, 5] as const;

function textField(values: FormData, name: string) {
  const value = values.get(name);
  return typeof value === 'string' ? value : '';
}

function addForm(selector: string, run: (input: FormData) => Promise<string>) {
  const form = document.querySelector<HTMLFormElement>(selector);
  const output = form?.querySelector('output');
  const button = form?.querySelector('button');
  if (!form || !output || !button) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    button.disabled = true;
    output.value = 'Sending…';
    void run(new FormData(form))
      .then((message) => {
        form.reset();
        output.value = message;
        return undefined;
      })
      .catch((error: unknown) => {
        output.value = error instanceof BackbricksError ? error.message : 'Could not submit.';
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}

function start(baseUrl: string, publishableKey: string) {
  const client = createClient({ baseUrl, publishableKey });
  addForm('#contact-form', async (input) => {
    const cv = input.get('cv');
    if (!(cv instanceof File) || cv.size === 0) return 'Choose a PDF.';
    if (!input.has('privacy')) return 'Accept the privacy notice.';
    const upload = await client.uploads.upload('cv', cv);
    await client.forms.submit('contact', {
      name: textField(input, 'name'),
      email: textField(input, 'email'),
      message: textField(input, 'message'),
      privacy: true,
      cv: [upload.fileRef],
    });
    return 'Message sent.';
  });
  addForm('#review-form', async (input) => {
    const rating = ratings.find((score) => score === Number(input.get('rating')));
    if (!rating) return 'Choose a rating between 1 and 5.';
    await client.reviews.submit('testimonials', {
      authorName: textField(input, 'author'),
      rating,
      body: textField(input, 'review'),
    });
    return 'Review sent for moderation.';
  });
  const list = document.querySelector('#published-reviews');
  if (list)
    void client.reviews
      .list('testimonials')
      .then(({ data }) => {
        for (const review of data) {
          const item = document.createElement('li');
          item.textContent = `${review.displayName} · ${review.rating} · ${review.body ?? ''}`;
          list.append(item);
        }
        return undefined;
      })
      .catch(() => {
        list.textContent = 'Could not load reviews.';
      });
}

export function mountIntegration() {
  const info = document.querySelector<HTMLElement>('#integration')?.dataset;
  if (info?.['url'] && info['key']) start(info['url'], info['key']);
}
