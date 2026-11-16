/** Generated code is pasted into websites, so labels and texts from the config are escaped. */
export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
/** A single-quoted JavaScript string literal. */
export const quote = (value: string) =>
  `'${JSON.stringify(value).slice(1, -1).replaceAll("'", "\\'")}'`;

export const PUBLISHABLE_KEY_PLACEHOLDER = 'YOUR_PUBLISHABLE_KEY';
export const SECRET_KEY_ENV = 'BACKBRICKS_SECRET_KEY';
export const sdkFormId = (formKey: string) => `backbricks-${formKey}`;
