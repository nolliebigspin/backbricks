# @backbricks/sdk

TypeScript SDK for websites and servers (MIT). Dependency-free ESM; runs in browsers, Node ≥ 20 and Bun. Not published to npm before v0.4.

```ts
import { BackbricksError, createClient } from '@backbricks/sdk';

const backbricks = createClient({
  publishableKey: 'bb_pk_…', // from the dashboard's Embed page
  baseUrl: 'https://backbricks.example.com/v1',
});

try {
  await backbricks.forms.submit('contact', { name, email, message, privacy: true });
} catch (error) {
  if (error instanceof BackbricksError && error.code === 'validation_failed') {
    for (const field of error.fieldErrors) console.log(field.path, field.code);
  }
}
```

- **Publishable keys** belong in website code. The SDK fetches a proof-of-work challenge and solves it before each submission (WebCrypto; fast in browsers and Bun, a few seconds on Node).
- **Secret keys** (`secretKey: process.env.BACKBRICKS_SECRET_KEY`) are for your server only and skip proof-of-work. The server rejects them from websites.
- `forms.submit(key, data, { idempotencyKey, honeypot, signal })` returns `{ id }`, or `{ accepted: true }` when the server dropped the entry as spam.
- Server, network and upload failures throw `BackbricksError` with `code`, `status`, `fieldErrors` and `requestId` (`network_error` when no response arrived).
- `backbricks codegen` (M5) types form submissions and explicit upload MIME choices by augmenting `BackbricksSchema`.

The typed management client is `@backbricks/sdk/admin`.

## Private uploads

```ts
const controller = new AbortController();
const uploaded = await backbricks.uploads.upload('cv', selectedFile, {
  signal: controller.signal,
  onProgress: ({ phase, loaded, total }) => {
    // Update your progress display: uploading, processing, then ready.
  },
});
await backbricks.forms.submit('application', {
  email,
  cv: [uploaded.fileRef],
});
```

`selectedFile` is a browser/Node File or a Blob. Supply `{ name: 'cv.pdf', type: 'application/pdf' }` for a Blob without a name or useful MIME type. The SDK requests one intent, makes one PUT, then polls completion with fresh proofs until inspection finishes. It never retries the intent or PUT automatically. Provider errors are sanitized; rejection, quarantine and soft drops fail explicitly (`upload_failed`, `upload_rejected`, `upload_quarantined`, `upload_not_accepted`).

The whole operation has a 120-second deadline; `timeoutMs` accepts 1 ms through 30 minutes. A deadline raises `upload_timeout`. Your AbortSignal cancels proof solving, network transfers and polling; cancellation preserves its reason (normally AbortError). Invalid local options raise TypeError.

Native browsers report byte progress through XMLHttpRequest. Node, Bun and a custom `fetch` report start/end byte progress plus processing/readiness. Provider requests carry no Backbricks credential or cookies; browsers set their own Content-Length. Configure storage CORS for your website origins. Do not alter the opaque signed URL or retry its PUT.

Keep `fileRef` in memory until claiming it with a form. It is a temporary bearer credential: never put it in URLs, logs or persistent browser storage. Form entries store file IDs. Downloads use the audited management endpoint; files remain private.

Real-service/browser acceptance: `CI=true bun run test:sdk-browser` (Postgres, Garage, Mailpit and Chromium). It uses the last configured Garage loopback CORS origin for a temporary site, proves native progress and aborts a throttled PUT. Normal quality checks exercise real Bun and Node upload/claim flows; selecting Node 20 on PATH repeats the same runtime test at the supported minimum.
