---
title: Self-host with Docker Compose
description: Try Backbricks locally or deploy the Forms, Uploads, and Reviews preview on your own server.
---

The published `0.1.0` Docker image supports Forms. The source preview also includes private Uploads, Reviews, and the management CLI.

## Try it locally

Install Docker with Compose v2. Download or clone the [source repository](https://github.com/nolliebigspin/backbricks) and open a terminal in the checkout. Compose installs the dependencies inside containers.

```sh
docker compose --profile storage up -d
```

1. Sign up at [localhost:5173/signup](http://localhost:5173/signup) with a test email address.
2. Open [Mailpit](http://localhost:8025) and follow the verification link in the email. Use the same `localhost` host name when you sign in.
3. Create an organization and project, then follow the [Forms guide](/docs/forms).

For protected uploads, start the local stack with ClamAV. The scanner downloads its signatures on first launch. [Private uploads](/docs/uploads) explains the upload area's scan policy.

```sh
SCANNER=clamav docker compose --profile storage --profile scan up -d
```

Stop the local stack from the same checkout. Its database and storage volumes are kept.

```sh
docker compose --profile storage --profile scan down
```

## Deploy to your own server

For the released Forms preview, follow the [published image instructions](https://github.com/nolliebigspin/backbricks#run-the-preview-image). They show how to configure PostgreSQL, run migrations, and start `ghcr.io/nolliebigspin/backbricks:0.1.0`.

For all three modules, the [source deployment runbook](https://github.com/nolliebigspin/backbricks/blob/main/deploy/compose/README.md) covers preparing settings from a development checkout, then using Docker on the server for HTTPS, first-owner setup, and encrypted backups.
