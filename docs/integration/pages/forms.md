---
title: Forms
description: Create a contact form, submit from your website, and verify the entry in the dashboard.
---

Create a form in **Inbox** using the **Contact form** template. Set the form key to `contact` for these examples. The template uses `name`, `email`, `message`, and `privacy`. Add your [website origin and publishable key](/docs#connect-your-first-website), then open the form's **Embed** tab to get its deployment URL and generated examples.

## Submit with the SDK

[Install the SDK from source](/docs/cli#install-the-preview-tools). Use the publishable key in browser code. The SDK handles the form's browser check and sends a JSON submission.

```ts
import { BackbricksError, createClient } from '@backbricks/sdk';

const backbricks = createClient({
  baseUrl: 'https://backbricks.example.com',
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
});

try {
  await backbricks.forms.submit('contact', {
    name: 'Jamie Example',
    email: 'jamie@example.com',
    message: 'This is a test submission.',
    privacy: true,
  });
} catch (error) {
  if (error instanceof BackbricksError && error.code === 'validation_failed') {
    for (const field of error.fieldErrors) {
      // Show the message for field.path in your form.
      console.log(field.path, field.code);
    }
  } else {
    throw error;
  }
}
```

Use real field values and the visitor's consent in your submit handler. Handle other errors in your UI and give the visitor a way to retry. See [API errors](/docs/errors) for the response fields.

## Submit without JavaScript

Follow the [HTML quickstart](/docs/html) to configure the browser check and success page. For attachments, use the [upload and claim workflow](/docs/uploads).

## Verify the entry

Submit from the same website origin your visitors will use. In the dashboard, open the form's **Entries** and look for your test message. Verify that confirmation or redirect works from the browser. You can then configure notifications, retention, and CSV export in the dashboard.
