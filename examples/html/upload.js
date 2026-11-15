import { BackbricksError, createClient } from '@backbricks/sdk';

const client = createClient({
  baseUrl: 'http://localhost:5173/v1',
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
});
const form = document.getElementById('backbricks-application');
const controls = form.querySelector('fieldset');
const output = form.querySelector('output');
const progress = form.querySelector('progress');
const cancel = form.querySelector('[data-cancel]');
let controller;
let uploaded;
let requestKey = crypto.randomUUID();

async function send() {
  if (controller) return;
  const selectedFile = form.querySelector('[name="cv"]').files[0];
  if (!selectedFile) return;
  const fields = new FormData(form);
  const honeypot = fields.get('_gotcha') || undefined;
  controller = new AbortController();
  controls.disabled = true;
  cancel.disabled = false;
  progress.hidden = false;
  progress.value = 0;
  output.textContent = 'Uploading your file…';
  try {
    // Keep a ready reference in memory when correcting a form validation error.
    if (!uploaded || uploaded.file !== selectedFile) {
      const ready = await client.uploads.upload('cv', selectedFile, {
        signal: controller.signal,
        honeypot,
        onProgress: ({ phase, loaded, total }) => {
          progress.max = total || 1;
          progress.value = loaded;
          output.textContent =
            phase === 'uploading'
              ? 'Uploading your file…'
              : 'Checking the file and sending your application…';
        },
      });
      uploaded = { file: selectedFile, ref: ready.fileRef };
    }
    await client.forms.submit(
      'application',
      {
        email: fields.get('email'),
        cv: [uploaded.ref],
      },
      { signal: controller.signal, honeypot, idempotencyKey: requestKey },
    );
    uploaded = undefined;
    requestKey = crypto.randomUUID();
    form.reset();
    output.textContent = 'Thank you! Your application was sent.';
  } catch (error) {
    if (controller.signal.aborted) output.textContent = 'Upload canceled. You can try again.';
    else if (error instanceof BackbricksError) {
      output.textContent = error.fieldErrors.length
        ? error.fieldErrors.map((field) => field.path + ': ' + field.message).join(' ')
        : error.message;
    } else output.textContent = 'The application could not be sent. Please try again.';
  } finally {
    controller = undefined;
    controls.disabled = false;
    cancel.disabled = true;
    progress.hidden = true;
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void send();
});
cancel.addEventListener('click', () => controller?.abort());
