# syntax=docker/dockerfile:1
# Build from monorepo root:
#   docker build -f apps/bot/Dockerfile -t eclipse-bot:local .

FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/bot/package.json apps/bot/
RUN pnpm install --frozen-lockfile --filter @eclipse/bot...

FROM base AS runtime
COPY --from=deps /app /app
COPY apps/bot apps/bot
COPY tsconfig.base.json ./

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@eclipse/bot", "start"]
