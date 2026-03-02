# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app

# Copy manifests for all workspaces needed by the api package
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/types/package.json ./packages/types/

# Install only production + build deps (no devDeps for types, but needed for build)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/types ./packages/types
COPY packages/api ./packages/api

# Build @leadflow/types first so its dist/ exists when api's tsc runs
RUN pnpm --filter @leadflow/types build
RUN pnpm --filter api build

# ─── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

WORKDIR /app
ENV NODE_ENV=production

# Only production manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --prod

# Built artefacts
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Static data files (skills.json, etc.)
COPY packages/api/src/data ./packages/api/dist/data

EXPOSE 3000

# Non-root user
RUN addgroup -S leadflow && adduser -S leadflow -G leadflow
USER leadflow

CMD ["node", "packages/api/dist/index.js"]
