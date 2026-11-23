# Example: contact form on a static website

Two pages with the same contact form (MIT). The code is exactly what the dashboard's **Embed** tab shows for a form with these fields ([`form.json`](form.json)); a test keeps them identical.

| Page | How it sends | Form settings it needs |
|---|---|---|
| [`index.html`](index.html) | Plain HTML, no JavaScript. The browser posts the form and lands on [`thanks.html`](thanks.html). | Short name `contact-plain`; **Browser check (proof-of-work) off**; success page set to your `thanks.html` URL. |
| [`sdk.html`](sdk.html) + [`sdk.js`](sdk.js) | The SDK solves the browser check, sends the entry and shows the result or the server's field errors. | Short name `contact`; defaults (browser check on). |

## Try it

1. Start Backbricks (`mise run dev`) and open the dashboard at <http://localhost:5173>.
2. In a project, create the two forms above from the **Contact form** template (it has exactly the fields in `form.json`), and adjust their settings as listed.
3. On the project's **Embed** page, create a publishable key and add the address you serve this folder from (e.g. `http://localhost:8080`) as an allowed website.
4. Replace `YOUR_PUBLISHABLE_KEY` in `index.html` and `sdk.js` with the key. If your API is not at `http://localhost:5173/v1`, replace that too.
5. Bundle the SDK for the browser and serve the folder:

   ```sh
   bun run --cwd examples/html build      # writes dist/backbricks-sdk.js for sdk.html's import map
   bunx serve examples/html -l 8080       # or any static file server
   ```

6. Send both forms; the entries appear in the form's **Entries** tab.

The hidden `_gotcha` input is the honeypot: people never see it, bots fill it, and their entries are dropped. Keep it in your form.

## Application with a private CV

[`upload.html`](upload.html) and [`upload.js`](upload.js) add a CV upload, readiness/progress and cancellation. Their code is also shown on an upload area's **Embed → Form attachment example** tab; a test keeps the files synchronized.

1. Enable `forms,uploads` and configure storage as described in the [uploads quickstart](../../README.md#quickstart). For virus checking, start `mise run scan` and choose `SCANNER=clamav`. A protected area refuses files when scanning is unavailable. Choosing `SCANNER=none` requires an explicitly unscanned area and accepts files without virus checking.
2. Create a **CV (PDF)** upload area with short name `cv` (the settings in [`upload-zone.json`](upload-zone.json)). Its default requires virus checking. If you deliberately use no scanner, choose the named unscanned template and understand its warning.
3. Create a form named `application` with the fields in [`application.json`](application.json): an identifying email and one required `cv` file field linked to that area.
4. Put your publishable key and API address in `upload.js`, then build/serve this folder as above. Storage must allow your site's origin too. For the development Garage bucket and the example on port 8080, configure its CORS through the existing initializer:

   ```sh
   S3_CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8080 bun scripts/dev/garage-init.ts
   ```

5. Open `upload.html`, choose a PDF and send. The SDK uploads once, waits for inspection, then claims its temporary reference with the form. The owner sees it in **Files** and **Inbox**, with private audited downloads.

Correcting a form validation error reuses the ready upload in memory; the form's idempotency key prevents a duplicate accepted submission. Cancel stops proof solving, transfer or polling. Unclaimed uploads expire after 24 hours. References and signed URLs are temporary credentials: never log them or put them in persistent browser storage. No-JavaScript forms remain available at `index.html`; file uploads require JavaScript.

## Testimonials and ratings

Create a review collection with short name `testimonials`. Put your publishable key and API address in [`reviews.js`](reviews.js), add the example site's origin to the project, then build and serve this folder as above. Open [`reviews.html`](reviews.html) and submit a review. In the dashboard, approve it and then publish it. Reload the example to see the review and updated rating. Deleting or unpublishing it removes it from the next public read.

## Configure the M5 examples with the CLI

Run `backbricks init --framework html` with the deployment URL, project ID and an agent key supplied in the environment. Retain the linked project ID and copy the module sections from [the Scenario A example](backbricks.config.example.json). Run `backbricks diff` before `backbricks push --yes`. The sample requires a scanner for CVs. Its contact form with a required PDF is intended for the [Next.js](../nextjs/) and [Astro](../astro/) examples. This directory also includes the standalone forms and upload fixtures documented above.
