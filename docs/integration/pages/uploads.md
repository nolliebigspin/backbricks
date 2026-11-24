---
title: Private uploads
description: Upload a file, wait for inspection, and attach it to a form entry.
---

Enable Uploads in your deployment. In the dashboard, create an upload area with key `cv`, an allowed type such as `application/pdf`, and a size limit. Protected areas need a configured scanner. For a deployment using `SCANNER=none`, choose an unscanned area explicitly.

In **Inbox**, create a form with key `application`. To use the sample below, give it an `email` field and a file field named `cv` connected to the `cv` upload area. If you use a template, supply any additional required fields, including consent where configured.

## Upload and attach the file

Use the [browser SDK client](/docs/forms#submit-with-the-sdk) with your publishable key. In your submit handler, take the selected `File` from the file input.

```ts
const controller = new AbortController();
// Call controller.abort() from your cancel button.
const upload = await backbricks.uploads.upload('cv', selectedFile, {
  signal: controller.signal,
  onProgress: ({ phase, loaded, total }) => {
    // Update your progress UI for uploading, processing, and ready.
  },
});

await backbricks.forms.submit('application', {
  email,
  cv: [upload.fileRef],
});
```

The SDK waits for the file to be ready before returning `fileRef`. Keep that temporary reference in memory until the submission claims it. Avoid putting it in URLs, logs, or browser storage. Use the dashboard entry to verify that the attachment is linked and downloads correctly.

## Troubleshoot an upload

- For a rejected file, compare its detected type and size with the upload area's rules. Handle rejection and quarantine in the UI.
- If the upload waits for inspection and times out, check the storage service, worker, and scanner on your deployment.
- The production Compose setup streams through Backbricks by default. If you configure direct-to-storage uploads, allow your site's exact origin in the storage provider's CORS settings.

Files stay private. Dashboard downloads and [scoped CLI downloads](/docs/cli#read-entries-and-download-files) use short-lived links.
