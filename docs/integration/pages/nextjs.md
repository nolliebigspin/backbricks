---
title: Next.js quickstart
description: Connect a Next.js App Router site with Backbricks.
---

[Install the preview SDK and CLI](/docs/cli#install-the-preview-tools). From your App Router project, [link the website](/docs/cli#link-a-website) with `init --framework nextjs`. Start Next.js after `init` writes `NEXT_PUBLIC_BACKBRICKS_KEY` and `NEXT_PUBLIC_BACKBRICKS_URL` to `.env.local`.

```ts
import { createClient } from '@backbricks/sdk';

export const backbricks = createClient({
  baseUrl: process.env.NEXT_PUBLIC_BACKBRICKS_URL!,
  publishableKey: process.env.NEXT_PUBLIC_BACKBRICKS_KEY!,
});
```

Import the browser client into a `'use client'` component and follow the [Forms SDK example](/docs/forms#submit-with-the-sdk) in your submit handler. Add development and production origins in **Allowed websites** before testing in the browser.

When you submit through a server action, create the SDK client in server-only code. Pass `secretKey: process.env.BACKBRICKS_SECRET_KEY` with the grant for that operation. Public `NEXT_PUBLIC_` variables should contain only the publishable settings.
