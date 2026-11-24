---
title: Vue quickstart
description: Connect a Vue and Vite site with Backbricks.
---

[Install the preview SDK and CLI](/docs/cli#install-the-preview-tools). From your Vue project, [link the website](/docs/cli#link-a-website) with `init --framework vue`. Start Vite after `init` writes `VITE_BACKBRICKS_URL` and `VITE_BACKBRICKS_KEY` to `.env.local`.

Create the client in a module or in the component's `<script setup lang="ts">`.

```ts
import { createClient } from '@backbricks/sdk';

const backbricks = createClient({
  baseUrl: import.meta.env.VITE_BACKBRICKS_URL,
  publishableKey: import.meta.env.VITE_BACKBRICKS_KEY,
});
```

Call it in a `@submit.prevent` handler. Map [structured validation errors](/docs/errors) to your inputs and reset the form after a successful [submission](/docs/forms#submit-with-the-sdk). For attachments, wait for the [upload reference](/docs/uploads) before submitting. Add both your Vite dev origin and production origin in **Allowed websites**.
