# Production Compose

Use an HTTPS origin and Docker Compose v2. Point the hostname at this host and allow inbound TCP 80 and 443 for Caddy. The app's direct port binds to loopback. For another TLS proxy, add `--no-tls` to configuration and set `TRUSTED_PROXIES` to that proxy's exact address in the app's Compose environment.

## Prepare the source preview

The current source includes Forms, Uploads and Reviews. The published `0.1.0` image is the Forms preview.

Generate the deployment settings from a development checkout with Bun, Node.js and the workspace dependencies installed. Use the CLI's [source build instructions](../../packages/cli/README.md).

```sh
bun run --cwd packages/cli build
node packages/cli/dist/backbricks.js deploy configure \
  --public-url https://backbricks.example.com --modules forms,uploads,reviews --scan --backup
```

The configuration command generates private settings and refuses to replace existing files. Use `--modules forms` and omit `--scan` for a minimal install. For Uploads without ClamAV, omit `--scan` and choose an explicitly unscanned upload area. The default upload mode streams through the app to private Garage. For presigned browser uploads use `UPLOAD_MODE=presigned`, set an HTTPS `S3_PUBLIC_ENDPOINT` pointing at your storage, and configure `S3_CORS_ORIGINS`.

## Start on the Docker host

Use a checkout of the same revision. Place the generated `.env` and any generated `garage.toml` or `restic-password` files in `deploy/compose` on the host. Keep them private. From the repository root, build the image and start the stack with Docker.

```sh
docker build -t backbricks/server:local .
docker compose --env-file deploy/compose/.env -f deploy/compose/compose.yaml up -d --wait
```

Compose runs migrations before starting the app. Run the remaining Compose commands from `deploy/compose` on your Docker host.

For the first dashboard account, place the chosen name, email and a long password in a mode-0600 JSON file with the keys `name`, `email` and `password`. Feed it directly to the one-shot setup process from your trusted server terminal.

```sh
docker compose run --rm -T setup < /secure/path/owner.json
```

The command creates the first verified account on an empty instance. Sign in through your HTTPS dashboard and create an organization and project. Remove the bootstrap password file after setup. Use SMTP for password reset, verification mail and notifications. Configure `SMTP_URL` and `MAIL_FROM` in the deployment's private environment file.

The default `all` role runs the worker inside the app. For separate processes, set `BACKBRICKS_ROLE=serve` and include `worker` in `COMPOSE_PROFILES`. Health checks and migrations use the same image. If the default Compose subnet conflicts with another network, set `CADDY_SUBNET`, `CADDY_DYNAMIC_RANGE` and `CADDY_ADDRESS` together. Keep the Caddy address outside the dynamic range.

## Backup and restore

Keep the generated `restic-password`, deployment settings (including `BACKUP_NAMESPACE`), and Garage configuration in independent protected storage. Schedule regular backups. Each successful backup rotates this deployment’s snapshots on a 30-day window and prunes unreferenced data. The example uses a host-mounted restic repository. Choose an off-host repository through `RESTIC_REPOSITORY` or copy the encrypted repository off-host. Keep the encryption password separate from the repository.

Initialize once:

```sh
docker compose run --rm backup init
```

Quiesce the app and any separate workers before backing up. If using Garage, stop it cleanly before taking the backup so its data and metadata match the database. Backups include retained Garage volumes even if Uploads is currently disabled. PostgreSQL remains running for `pg_dump`.

```sh
docker compose stop app
# Stop worker and garage too if those services are enabled.
docker compose run --rm backup backup
docker compose run --rm backup snapshots
docker compose up -d --wait
```

Restore using the same enabled modules and Garage settings in a new Compose project on a clean target. Point the backup service at the protected repository and password from the source. Start only the empty PostgreSQL service before restoring.

```sh
docker compose up -d --wait postgres
docker compose run --rm backup restore SNAPSHOT_ID
docker compose up -d --wait
```

Verify sign-in, an existing form entry, private file bytes, and published reviews before switching traffic. Restore refuses a target with application tables or existing Garage data. If a restore fails, keep the app stopped and retry with a fresh target. For external object storage, take and restore a matching provider backup.

## Upgrade

1. Read the changelog and take a quiesced backup. Keep a copy of the previous image reference and environment.
2. Stop the app and worker. Set `BACKBRICKS_IMAGE` to the reviewed image and pull it or build it locally.
3. Run `docker compose run --rm migrate` before restarting. Migrations are forward-only.
4. Start the stack and check `/readyz`, dashboard sign-in, and one workflow per enabled module. Recover with the previous image and the corresponding backup if needed.

See the [self-hosting threat model](../../docs/SECURITY-MODEL.md) for deployment assumptions and the [private reporting process](../../SECURITY.md).
