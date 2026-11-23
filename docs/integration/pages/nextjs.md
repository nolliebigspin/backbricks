---
title: Next.js quickstart
description: Connect a Next.js App Router site with Backbricks.
---

Run [the CLI setup](/docs/cli) from your App Router project. It writes `NEXT_PUBLIC_BACKBRICKS_KEY` and `NEXT_PUBLIC_BACKBRICKS_URL`.

```ts
import { createClient } from '@backbricks/sdk';

export const backbricks = createClient({
  baseUrl: process.env.NEXT_PUBLIC_BACKBRICKS_URL!,
  publishableKey: process.env.NEXT_PUBLIC_BACKBRICKS_KEY!,
});
```

Use the browser client in a client component. If you submit through a server action, use a separate server-only secret with the relevant submission scope. Store it as `BACKBRICKS_SECRET_KEY` with no public prefix.
