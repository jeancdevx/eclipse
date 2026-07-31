# syntax=docker/dockerfile:1
# Build from monorepo root:
#   docker build -f apps/web/Dockerfile -t eclipse-web:local .

FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @eclipse/web...

FROM deps AS build
COPY apps/web apps/web
COPY packages/auth packages/auth
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
# Build placeholders only — runtime env from compose (no public API token).
ARG BETTER_AUTH_SECRET=build-time-secret-change-me-32chars
ARG BETTER_AUTH_URL=http://localhost:3000
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
ENV AUTH_DEV_BYPASS=false
RUN mkdir -p apps/web/public && pnpm --filter @eclipse/web build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
