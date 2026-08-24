# Build context is the REPO ROOT (docker build -f apps/web/Dockerfile .), not
# apps/web — the pnpm workspace (packages/shared) has to be visible to install
# and build correctly. docker-compose.*.yml is already set up this way.

FROM node:22-alpine AS base
RUN corepack enable

# --- deps: install the whole workspace's dependencies once, cached by lockfile ---
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

# --- build: @yaseen/shared first (web imports its build output), then web ---
FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN pnpm --filter @yaseen/shared build
RUN pnpm --filter @yaseen/web build

# --- runtime: just the standalone server, nothing else ---
FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# outputFileTracingRoot (next.config.mjs) puts the standalone tree at
# apps/web/ inside .next/standalone, mirroring the workspace layout.
COPY --from=build --chown=nextjs:nodejs /repo/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
