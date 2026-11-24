---
title: HTML quickstart
description: Connect a plain HTML site with Backbricks.
---

## Configure a plain HTML form

1. [Create a contact form](/docs/forms) and add your site's exact origin to the project.
2. In the form's settings, turn off **Browser check** for this HTML-only form. Keep the honeypot enabled.
3. Under **After sending**, set **Page after a successful entry** to a page on an allowed website, such as `https://www.example.com/thanks`.
4. Copy the HTML snippet from the **Embed** tab. It includes your deployment URL, form key, and publishable key.

This example posts to a form with key `contact` using the Contact template's field keys.

```html
<form method="post" action="https://backbricks.example.com/v1/public/forms/contact/submissions?key=YOUR_PUBLISHABLE_KEY">
  <label>Name <input name="name" required></label>
  <label>Email <input name="email" type="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <label><input name="privacy" type="checkbox" required> I agree to be contacted about my request.</label>
  <div hidden><input name="_gotcha" tabindex="-1" autocomplete="off"></div>
  <button type="submit">Send</button>
</form>
```

Use your own consent language and configured field names. Serve the website over HTTP locally or HTTPS in production, then submit a test entry and confirm it appears in the dashboard. If the host rejects the submission, compare the action with **Embed** and review [API errors](/docs/errors).

Use the [SDK form](/docs/forms#submit-with-the-sdk) for an inline confirmation or the [upload workflow](/docs/uploads) to attach private files.
