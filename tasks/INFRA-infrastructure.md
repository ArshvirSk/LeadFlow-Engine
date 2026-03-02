# EPIC: INFRA — Infrastructure & DevOps Foundation

**Phase Scope:** 1–4 | **Owner:** DevOps / Full-stack

---

## Story INFRA-S01: Project Scaffold & Monorepo Setup

_As a developer, I can clone the repo and run all services with one command so that the development environment is consistent across all contributors._

### INFRA-T01 — Initialize pnpm Monorepo Structure

- **ID:** INFRA-T01
- **Phase:** 1
- **Dependencies:** None
- **Estimate:** 3 SP
- **Owner:** Full-stack / DevOps
- **Acceptance Criteria:**
  1. `pnpm install` from root installs all workspace dependencies
  2. All packages resolve shared types from `packages/types`
  3. `pnpm dev` starts API, workers, and frontend concurrently via `turbo`
  4. `.env.example` file documents all required environment variables

#### Subtasks:

- Create `packages/` directory with: `api/`, `workers/`, `web/`, `extension/`, `types/`
- Configure `pnpm-workspace.yaml` and `turbo.json`
- Set up root `package.json` with workspace scripts: `dev`, `build`, `test`, `lint`
- Create shared `packages/types/` with TypeScript interfaces for Lead, UserProfile, SourceAdapter
- Configure `tsconfig.json` base with path aliases
- Add `.gitignore`, `.env.example`, `README.md`
- Set up ESLint + Prettier config shared across all packages
- Add `docker-compose.yml` for local PostgreSQL + Redis

---

### INFRA-T02 — Configure PostgreSQL 16 + pgvector

- **ID:** INFRA-T02
- **Phase:** 1
- **Dependencies:** INFRA-T01
- **Estimate:** 3 SP
- **Owner:** DevOps / Backend
- **Acceptance Criteria:**
  1. PostgreSQL 16 with `pgvector` extension enabled on both local Docker and Railway
  2. `CREATE EXTENSION vector;` verified in migration script
  3. Connection pooling configured via `pg` or `pgBouncer` with max 20 connections
  4. Health check endpoint returns DB connection status

#### Subtasks:

- Add PostgreSQL 16 service to `docker-compose.yml` with `pgvector` image (`ankane/pgvector:latest`)
- Provision Railway PostgreSQL instance with pgvector enabled
- Configure `DATABASE_URL` in `.env.example` and Railway environment
- Create database initialization script that runs `CREATE EXTENSION IF NOT EXISTS vector`
- Set up `node-postgres` (`pg`) connection pool in `packages/api/src/db/client.ts`
- Write connection health check function
- Add DB connection test to CI pipeline

---

### INFRA-T03 — Configure Redis 7

- **ID:** INFRA-T03
- **Phase:** 1
- **Dependencies:** INFRA-T01
- **Estimate:** 2 SP
- **Owner:** DevOps / Backend
- **Acceptance Criteria:**
  1. Redis 7 running locally via Docker and on Railway
  2. BullMQ can connect and publish/consume test message
  3. `REDIS_URL` configured in all service environments
  4. Redis `maxmemory-policy` set to `noeviction` (queue safety)

#### Subtasks:

- Add Redis 7 service to `docker-compose.yml`
- Provision Railway Redis instance
- Configure `REDIS_URL` in environment files
- Create Redis client wrapper in `packages/workers/src/redis/client.ts`
- Verify BullMQ connection with test queue publish/consume
- Set `maxmemory-policy noeviction` in Redis config

---

### INFRA-T04 — Set Up BullMQ Queue Topology

- **ID:** INFRA-T04
- **Phase:** 1
- **Dependencies:** INFRA-T03
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. All named queues (`raw.leads`, `normalized.leads`, `scored.leads`, `outreach.drafts`, `scheduled.sends`) are created and accessible
  2. Queue events (failed, stalled, completed) are logged
  3. Bull Board dashboard accessible at `/admin/queues` (dev only, auth-gated)
  4. Failed job retry configured: 3 attempts, exponential backoff (1m, 5m, 15m)

#### Subtasks:

- Define queue names as typed constants in `packages/types/src/queues.ts`
- Create `QueueManager` class in `packages/workers/src/queues/manager.ts`
- Configure all 5 queues with default job options (removeOnComplete: 100, removeOnFail: 500)
- Set up exponential backoff retry: attempts=3, backoff type=exponential, delay=60000ms
- Add `@bull-board/fastify` dashboard mounted at `/admin/queues`
- Add queue event listeners for alerting (failed, stalled events → Datadog in Phase 2)
- Write integration test: publish to `raw.leads`, assert consumer receives message

---

## Story INFRA-S02: Deployment Pipeline

### INFRA-T05 — Set Up Railway Deployment (API + Workers)

- **ID:** INFRA-T05
- **Phase:** 1
- **Dependencies:** INFRA-T01, INFRA-T02, INFRA-T03
- **Estimate:** 2 SP
- **Owner:** DevOps
- **Acceptance Criteria:**
  1. Push to `main` triggers automatic Railway deployment for API and workers
  2. Environment variables injected from Railway project settings
  3. Health check endpoint (`GET /health`) returns 200 within 30s of deploy
  4. Zero-downtime deployment via Railway's rolling restart

#### Subtasks:

- Create `railway.json` with service definitions for API and worker processes
- Configure `Procfile` or Railway service commands for each process
- Set up Railway environment variables for all `INFRA-T01` env vars
- Configure Railway health check path to `GET /health`
- Add `GET /health` endpoint to Fastify API returning DB + Redis status
- Test deploy pipeline with a sample commit

---

### INFRA-T06 — Set Up Vercel Frontend Deployment

- **ID:** INFRA-T06
- **Phase:** 1
- **Dependencies:** INFRA-T01
- **Estimate:** 1 SP
- **Owner:** DevOps / Frontend
- **Acceptance Criteria:**
  1. Push to `main` triggers Vercel build and deploy of `packages/web`
  2. Preview deployments created for every pull request
  3. `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` configured in Vercel
  4. Production domain configured with SSL

#### Subtasks:

- Connect `packages/web` directory to Vercel project
- Configure Vercel build command: `pnpm build --filter=web`
- Set environment variables in Vercel dashboard
- Configure custom domain + SSL (if available)
- Enable preview deployments for PRs

---

## Story INFRA-S03: Observability & Monitoring

### INFRA-T07 — Configure Datadog APM + Logging

- **ID:** INFRA-T07
- **Phase:** 2
- **Dependencies:** INFRA-T05
- **Estimate:** 3 SP
- **Owner:** DevOps / Backend
- **Acceptance Criteria:**
  1. All API requests traced in Datadog APM with p50/p95/p99 latency
  2. Worker job durations tracked as custom metrics per queue
  3. Error logs shipped to Datadog Log Management with service tags
  4. Dashboard created: queue depth, ingestion rate, scoring latency, API error rate

#### Subtasks:

- Install `dd-trace` and configure in API + worker entry points
- Add Datadog agent to Railway services
- Tag all traces with `service`, `env`, `version`
- Create custom metrics: `leadflow.queue.depth`, `leadflow.lead.ingested`, `leadflow.lead.scored`, `leadflow.outreach.generated`
- Configure Datadog Log Management: structured JSON logs from Fastify + BullMQ
- Create Datadog dashboard with key platform health metrics
- Configure alerts: queue depth > 1000, error rate > 1%, scoring latency > 30s

---

### INFRA-T08 — Source Health Monitor

- **ID:** INFRA-T08
- **Phase:** 2
- **Dependencies:** INFRA-T07, L1-T01
- **Estimate:** 3 SP
- **Owner:** Backend / DevOps
- **Acceptance Criteria:**
  1. Every source adapter's `healthCheck()` runs every 30 minutes
  2. Alert fires if any source fails 3 consecutive polls
  3. Source health status visible in admin dashboard
  4. Auto-fallback to scrape method when API source fails (where scrape exists)

#### Subtasks:

- Create `SourceHealthWorker` BullMQ worker that calls all `adapter.healthCheck()` on cron
- Store health status in Redis with TTL (source ID → last check result + consecutive failures)
- Implement alerting via Datadog custom event when `consecutiveFailures >= 3`
- Add source health status endpoint: `GET /admin/sources/health`
- Implement fallback logic in adapters that support both API and scrape methods
- Write test: mock adapter healthCheck to return failure, verify alert triggered after 3rd failure

---

### INFRA-T09 — AWS ECS Fargate Migration Prep

- **ID:** INFRA-T09
- **Phase:** 4
- **Dependencies:** INFRA-T05, INFRA-T07
- **Estimate:** 8 SP
- **Owner:** DevOps
- **Acceptance Criteria:**
  1. All services containerized with production-ready Dockerfiles
  2. ECS task definitions created for API, ingestion workers, scoring workers
  3. Auto-scaling policy configured: scale ingestion workers when queue depth > 500
  4. Migration from Railway to ECS completed with zero data loss

#### Subtasks:

- Write production Dockerfiles for all services (multi-stage, non-root user)
- Create ECR repositories for all service images
- Write ECS task definitions (task CPU/memory sized for each service type)
- Configure ECS Application Auto Scaling based on BullMQ queue depth (via CloudWatch custom metric)
- Provision RDS PostgreSQL (migrating from Railway Postgres) + ElastiCache Redis
- Run database migration from Railway to RDS
- Set up Application Load Balancer for API service
- Cutover DNS to new ECS endpoint
- Decommission Railway services
