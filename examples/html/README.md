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
