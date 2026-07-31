# syntax=docker/dockerfile:1
# Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t eclipse-api:local .

FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/game-host/package.json packages/game-host/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @eclipse/api...

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    openssh-client \
  && DOCKER_VERSION=27.5.1 \
  && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" \
    | tar -xz -C /tmp \
  && mv /tmp/docker/docker /usr/local/bin/docker \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && curl -fsSL "https://github.com/docker/compose/releases/download/v2.38.2/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/bin/docker /usr/local/lib/docker/cli-plugins/docker-compose \
  && rm -rf /tmp/docker /var/lib/apt/lists/*
COPY --from=deps /app /app
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/game-host packages/game-host
COPY packages/shared packages/shared
COPY infra/docker/compose.guest.yaml infra/docker/compose.guest.yaml
COPY tsconfig.base.json ./
RUN chmod +x /app/apps/api/docker-entrypoint.sh

ENV NODE_ENV=production
ENV MC_COMPOSE_FILE=/app/infra/docker/compose.guest.yaml
EXPOSE 4000
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
CMD ["pnpm", "--filter", "@eclipse/api", "start"]
