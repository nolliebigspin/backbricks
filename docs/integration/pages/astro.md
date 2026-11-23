---
title: Astro quickstart
description: Connect an Astro site with Backbricks.
---

Run [the CLI setup](/docs/cli) from your Astro project. Import the SDK from a browser script and use the variables that `init` writes.

```ts
import { createClient } from '@backbricks/sdk';

const backbricks = createClient({
  baseUrl: import.meta.env.PUBLIC_BACKBRICKS_URL,
  publishableKey: import.meta.env.PUBLIC_BACKBRICKS_KEY,
});
```

Add your built site's origin to Project Embed. Run `doctor --origin` with the exact origin before deploying.
