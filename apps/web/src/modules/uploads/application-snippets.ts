import en from '../../i18n/en.json';
import { escapeHtml, quote, PUBLISHABLE_KEY_PLACEHOLDER, sdkFormId } from '../snippet-values.ts';

type Input = { baseUrl: string; publishableKey: string | null; zoneKey: string; formKey: string };
/** A complete attachment example; translated copy and protocol values have one owner. */
export function uploadApplicationSnippets(input: Input, copy: typeof en.uploads.example) {
  const id = sdkFormId(input.formKey);
  const form = `<form id="${escapeHtml(id)}">
  <fieldset>
    <label>${escapeHtml(copy.email)}
      <input type="email" name="email" required>
    </label>
    <label>${escapeHtml(copy.file)}
      <input type="file" name="cv" required>
    </label>
    <div hidden>
      <input name="_gotcha" tabindex="-1" autocomplete="off">
    </div>
    <button type="submit">${escapeHtml(copy.submit)}</button>
  </fieldset>
  <progress hidden max="1" value="0" aria-label="${escapeHtml(copy.progress)}"></progress>
  <output></output>
  <button type="button" data-cancel disabled>${escapeHtml(copy.cancel)}</button>
</form>
`;
  const script = `import { BackbricksError, createClient } from '@backbricks/sdk';

const client = createClient({
  baseUrl: ${quote(input.baseUrl)},
  publishableKey: ${quote(input.publishableKey ?? PUBLISHABLE_KEY_PLACEHOLDER)},
});
const form = document.getElementById(${quote(id)});
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
  output.textContent = ${quote(copy.uploading)};
  try {
    // Keep a ready reference in memory when correcting a form validation error.
    if (!uploaded || uploaded.file !== selectedFile) {
      const ready = await client.uploads.upload(${quote(input.zoneKey)}, selectedFile, {
        signal: controller.signal,
        honeypot,
        onProgress: ({ phase, loaded, total }) => {
          progress.max = total || 1;
          progress.value = loaded;
          output.textContent =
            phase === 'uploading'
              ? ${quote(copy.uploading)}
              : ${quote(copy.processing)};
        },
      });
      uploaded = { file: selectedFile, ref: ready.fileRef };
    }
    await client.forms.submit(
      ${quote(input.formKey)},
      {
        email: fields.get('email'),
        cv: [uploaded.ref],
      },
      { signal: controller.signal, honeypot, idempotencyKey: requestKey },
    );
    uploaded = undefined;
    requestKey = crypto.randomUUID();
    form.reset();
    output.textContent = ${quote(copy.sent)};
  } catch (error) {
    if (controller.signal.aborted) output.textContent = ${quote(copy.canceled)};
    else if (error instanceof BackbricksError) {
      output.textContent = error.fieldErrors.length
        ? error.fieldErrors.map((field) => field.path + ': ' + field.message).join(' ')
        : error.message;
    } else output.textContent = ${quote(copy.failed)};
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
`;
  return { form, script };
}

/** Translate the example using the same complete key set as the checked locale files. */
export function uploadExampleCopy(t: (key: string) => string) {
  return {
    ...en.uploads.example,
    ...Object.fromEntries(
      Object.keys(en.uploads.example).map((key) => [key, t(`uploads.example.${key}`)]),
    ),
  };
}
