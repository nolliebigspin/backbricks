import { SECRET_KEY_ENV } from '../forms/snippets.ts';
/** JSON string literals keep addresses and zone keys from changing generated script syntax. */
export function uploadSnippets(input: {
  baseUrl: string;
  publishableKey: string | null;
  zoneKey: string;
}) {
  const common = `const file = await client.uploads.upload(${JSON.stringify(input.zoneKey)}, selectedFile);\n// Keep file.fileRef only until submitting the form:\n// await client.forms.submit('application', { cv: [file.fileRef] });`;
  return {
    browser: `import { createClient } from '@backbricks/sdk';\n\nconst client = createClient({\n  baseUrl: ${JSON.stringify(input.baseUrl)},\n  publishableKey: ${JSON.stringify(input.publishableKey ?? 'YOUR_PUBLISHABLE_KEY')},\n});\nconst selectedFile = document.querySelector('input[type="file"]').files[0];\n${common}`,
    server: `import { readFile } from 'node:fs/promises';\nimport { createClient } from '@backbricks/sdk';\n\nconst client = createClient({\n  baseUrl: ${JSON.stringify(input.baseUrl)},\n  secretKey: process.env.${SECRET_KEY_ENV},\n});\nconst selectedFile = new File([await readFile('cv.pdf')], 'cv.pdf', { type: 'application/pdf' });\n${common}`,
  };
}
