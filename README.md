# LeadFlow Engine

AI-powered freelance lead intelligence platform. Ingests leads from 5 sources, scores them 0–100 against your profile, generates cold email drafts, and auto-queues top leads via autopilot.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, Tailwind, shadcn/ui, Clerk |
| API | Fastify 4, Drizzle ORM, PostgreSQL + pgvector |
| Workers | BullMQ, Node.js (normalization, scoring, outreach, embeddings, autopilot) |
| Database | Neon (PostgreSQL 16 + pgvector) |
| Queue | Upstash (Redis) |
| Auth | Clerk |
| AI | Anthropic Claude (scoring + drafts), OpenAI (embeddings) |
| Deploy | Koyeb (API + Workers), Vercel (Frontend) |

## Monorepo Structure

```
packages/
  api/        Fastify REST API
  workers/    BullMQ background workers + ingestion adapters
  web/        Next.js dashboard
  types/      Shared TypeScript types
```

## Sources (Phase 1)

- Hacker News "Who's Hiring" / "Seeking Freelancer"
- RemoteOK (RSS)
- WeWorkRemotely (RSS)
- Reddit r/forhire
- Upwork (RSS)

## Local Development

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker

# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis
docker-compose up -d

# 3. Copy and fill environment variables
cp .env.example .env

# 4. Run migrations
pnpm db:migrate

# 5. Start everything
pnpm dev
```

Services:
- Frontend: http://localhost:3001
- API: http://localhost:3000
- Bull Board: http://localhost:3000/admin/queues

## Environment Variables

See [`.env.example`](.env.example) for all required variables.

## Deploy

See the deployment plan in [`tasks/SPRINT-phase1-plan.md`](tasks/SPRINT-phase1-plan.md).

Full stack: **Neon + Upstash + Koyeb + Vercel** (free tier).
