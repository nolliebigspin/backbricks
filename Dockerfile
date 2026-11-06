# syntax=docker/dockerfile:1
#
# Production image: one image for every role (ADR-0002).
#   docker build -t backbricks/server .
#   docker run backbricks/server serve|worker|all|migrate
# Runs as the non-root `bun` user and works with a read-only root file system
# (`--read-only --tmpfs /tmp`).

ARG BUN_VERSION=1.4.4

# Only the package manifests, so the dependency layers stay cached until a manifest changes.
FROM oven/bun:${BUN_VERSION} AS manifests
WORKDIR /src
COPY . .
RUN mkdir /manifests \
  && cp package.json bun.lock /manifests/ \
  && find apps packages -name package.json -not -path '*/node_modules/*' \
    -exec sh -c 'mkdir -p "/manifests/$(dirname "$1")" && cp "$1" "/manifests/$1"' _ {} \;

# Dashboard build (needs dev dependencies: Vite, Tailwind).
FROM oven/bun:${BUN_VERSION} AS web
WORKDIR /app
COPY --from=manifests /manifests ./
RUN bun install --frozen-lockfile --ignore-scripts --filter @backbricks/web
COPY tsconfig.base.json ./
COPY packages/ui packages/ui
COPY packages/sdk packages/sdk
COPY apps/web apps/web
RUN cd apps/web && bun --bun vite build

# Production dependencies of the server and the packages it uses, plus their sources.
FROM oven/bun:${BUN_VERSION} AS server
WORKDIR /app
COPY --from=manifests /manifests ./
RUN bun install --frozen-lockfile --ignore-scripts --production --filter @backbricks/server
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/auth packages/auth
COPY packages/adapters packages/adapters
COPY packages/db packages/db
COPY packages/modules packages/modules
COPY apps/server apps/server

FROM oven/bun:${BUN_VERSION}-slim AS runtime
LABEL org.opencontainers.image.title="Backbricks" \
      org.opencontainers.image.description="Headless backend features for websites (server, worker, dashboard)" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/nolliebigspin/backbricks"
WORKDIR /app
ENV NODE_ENV=production \
    # No transpiler cache on disk, so the root file system can be read-only.
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
COPY --from=server --chown=root:root /app /app
COPY --from=web --chown=root:root /app/apps/web/dist /app/apps/web/dist
USER bun
EXPOSE 3000
# No HEALTHCHECK here: it would apply to every role, and `worker`/`migrate` serve no HTTP.
# Compose files define it per service (`serve`: GET /healthz).
ENTRYPOINT ["bun", "--no-env-file", "apps/server/src/main.ts"]
CMD ["serve"]
