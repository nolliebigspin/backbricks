import { BackbricksError, createClient } from '@backbricks/sdk';

const backbricks = createClient({
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
  baseUrl: 'http://localhost:5173/v1',
});

const form = document.getElementById('backbricks-contact');
const result = form.querySelector('output');

async function send() {
  const fields = new FormData(form);
  // Empty inputs are left out, so the server reports missing required fields.
  const text = (name) => fields.get(name) || undefined;
  form.querySelector('button').disabled = true;
  try {
    await backbricks.forms.submit(
      'contact',
      {
        name: text('name'),
        email: text('email'),
        message: text('message'),
        privacy: fields.has('privacy'),
      },
      { honeypot: text('_gotcha') },
    );
    form.reset();
    result.textContent = 'Thank you! Your message was sent.';
  } catch (error) {
    if (!(error instanceof BackbricksError)) throw error;
    result.textContent = error.fieldErrors.length
      ? error.fieldErrors.map((field) => `${field.path}: ${field.message}`).join(' ')
      : error.message;
  } finally {
    form.querySelector('button').disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void send();
});
