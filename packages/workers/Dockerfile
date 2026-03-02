# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/workers/package.json ./packages/workers/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/types ./packages/types
COPY packages/workers ./packages/workers

RUN pnpm --filter workers build

# ─── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/workers/package.json ./packages/workers/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/workers/dist ./packages/workers/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Static data files (skills.json, etc.)
COPY packages/workers/src/data ./packages/workers/dist/data

# Non-root user
RUN addgroup -S leadflow && adduser -S leadflow -G leadflow
USER leadflow

# Workers process — no exposed port needed (outbound only)
CMD ["node", "packages/workers/dist/index.js"]
