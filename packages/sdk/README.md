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
- Every failure throws `BackbricksError` with `code`, `status`, `fieldErrors` and `requestId` (`network_error` when no response arrived).
- `backbricks codegen` (M5) types `forms.submit` per form by augmenting `BackbricksSchema`.

The typed management client is `@backbricks/sdk/admin`.
