---
title: Astro quickstart
description: Connect an Astro site with Backbricks.
---

[Install the preview SDK and CLI](/docs/cli#install-the-preview-tools). From your Astro project, [link the website](/docs/cli#link-a-website) with `init --framework astro`. Start Astro after `init` writes `PUBLIC_BACKBRICKS_URL` and `PUBLIC_BACKBRICKS_KEY` to `.env.local`.

Create the browser client inside a bundled `<script>` in your `.astro` component.

```ts
import { createClient } from '@backbricks/sdk';

const backbricks = createClient({
  baseUrl: import.meta.env.PUBLIC_BACKBRICKS_URL,
  publishableKey: import.meta.env.PUBLIC_BACKBRICKS_KEY,
});
```

Call the client in your submit handler using the [Forms SDK example](/docs/forms#submit-with-the-sdk). Add both your dev and production origins in **Allowed websites**. Run `npx backbricks doctor --origin https://www.example.com` with the production origin before deploying.
