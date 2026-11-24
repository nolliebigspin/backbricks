---
title: Get started with Backbricks
description: Set up Backbricks and connect a website to Forms, private Uploads, and Reviews.
---

Backbricks handles submissions, private files, and reviews behind your own website. You build the interface. Site owners read entries, download attachments, and moderate reviews in the dashboard.

## Connect your first website

1. [Run Backbricks with Docker Compose](/docs/self-host) or get the URL of an existing deployment. The current source build supports all three modules. The published `0.1.0` image supports Forms.
2. In the dashboard, create an organization and a project. In **Allowed websites**, add your site's exact origin, including the port for local development. For example, add `http://localhost:4321` for a site served at that address.
3. Create a publishable key under **Access keys**. Copy it and your deployment URL from the dashboard when you connect your website.
4. [Send a test form entry](/docs/forms) and open it under **Entries** in the dashboard.

## Choose how to integrate

| Goal | Guide |
| --- | --- |
| Post straight from a website form | [HTML quickstart](/docs/html) |
| Handle validation in the page | [Forms with the TypeScript SDK](/docs/forms#submit-with-the-sdk) |
| Collect CVs and other private files | [Private uploads](/docs/uploads) |
| Show reviews and rating summaries | [Reviews](/docs/reviews) |
| Configure or administer a project from a terminal or agent | [CLI and MCP](/docs/cli) |
| Call endpoints directly | [API reference](/docs/api) and [API errors](/docs/errors) |

A publishable key goes in website code. Use a separate, scoped secret key for trusted servers or agents. Dashboard sessions are for operations that need a signed-in user's permissions.
