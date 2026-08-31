# Build context is the REPO ROOT (docker build -f apps/api/Dockerfile .), not
# apps/api — the pnpm workspace (packages/shared) has to be visible to install
# and build correctly. docker-compose.*.yml is already set up this way.

FROM node:22-alpine AS base
# Prisma's query engine needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl
RUN corepack enable

# --- deps: install the whole workspace's dependencies once, cached by lockfile ---
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

# --- build: @yaseen/shared first (api imports its build output), then api ---
FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @yaseen/shared build
RUN pnpm --filter @yaseen/api db:generate
RUN pnpm --filter @yaseen/api build

# --- runtime: the whole workspace's node_modules travel along (pnpm's
# symlinked node_modules make a "prod-only" prune harder to get right than
# it's worth here) — just the built output and the Prisma schema/migrations
# folder are new; everything else is copied straight from the build stage. ---
FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nestjs && adduser --system --uid 1001 nestjs

COPY --from=build --chown=nestjs:nestjs /repo/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nestjs:nestjs /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=nestjs:nestjs /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nestjs:nestjs /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=nestjs:nestjs /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nestjs /repo/apps/api/src/generated ./apps/api/src/generated
COPY --from=build --chown=nestjs:nestjs /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=nestjs:nestjs /repo/apps/api/package.json ./apps/api/package.json
# tsconfig.seed.json (extends @yaseen/config/tsconfig.nest.json, which
# extends tsconfig.base.json) is needed at runtime, not just build time —
# `pnpm db:seed` runs via ts-node inside this image, not during `docker build`.
COPY --from=build --chown=nestjs:nestjs /repo/apps/api/tsconfig.seed.json ./apps/api/tsconfig.seed.json
COPY --from=build --chown=nestjs:nestjs /repo/packages/config/tsconfig.base.json ./packages/config/tsconfig.base.json
COPY --from=build --chown=nestjs:nestjs /repo/packages/config/tsconfig.nest.json ./packages/config/tsconfig.nest.json
COPY --from=build --chown=nestjs:nestjs /repo/packages/config/package.json ./packages/config/package.json

WORKDIR /repo/apps/api
USER nestjs
EXPOSE 3001

# Starts the API. Migrations are run as a pre-deploy step in GitHub Actions
# to ensure zero-downtime rolling updates.
CMD ["node", "dist/main.js"]
