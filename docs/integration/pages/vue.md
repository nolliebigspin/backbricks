---
title: Vue quickstart
description: Connect a Vue and Vite site with Backbricks.
---

Run [the CLI setup](/docs/cli) from your Vite project.

```ts
import { createClient } from '@backbricks/sdk';

const backbricks = createClient({
  baseUrl: import.meta.env.VITE_BACKBRICKS_URL,
  publishableKey: import.meta.env.VITE_BACKBRICKS_KEY,
});
```

Call the client in your submit handler. Use the upload result's `fileRef` for file fields and handle structured field errors with `BackbricksError`.
