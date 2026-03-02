# Phase 1 Sprint Plan — Weeks 1–6 (MVP)

**Target:** Working MVP with 5 sources, AI scoring, cold email outreach, and React dashboard deployed on Railway + Vercel
**Team Model:** 1-2 developers working full-stack

---

## Pre-Sprint Checklist (Before Week 1 Begins)

| Decision                                           | Owner     | Deadline |
| -------------------------------------------------- | --------- | -------- |
| DEC-01: lead_scores join table confirmed           | Architect | Day 0    |
| DEC-02: Clerk plan selected (free tier ok for MVP) | Product   | Day 0    |
| DEC-03: Railway + Vercel accounts created          | DevOps    | Day 0    |
| DEC-04: Anthropic Claude API key obtained          | Dev       | Day 0    |
| OpenAI API key obtained                            | Dev       | Day 0    |
| Crunchbase API trial activated                     | Dev       | Day 0    |
| pnpm 8+ installed globally                         | Dev       | Day 0    |
| Node.js 20 LTS installed                           | Dev       | Day 0    |
| Docker Desktop running                             | Dev       | Day 0    |

---

## Week 1: Infrastructure & Auth Foundation

**Goal:** Local development environment fully working; PostgreSQL + Redis + BullMQ running; Clerk auth integrated

### Monday–Tuesday

| Task ID   | Title                                             | Estimate | Owner |
| --------- | ------------------------------------------------- | -------- | ----- |
| INFRA-T01 | pnpm monorepo scaffold (5 packages)               | 3 SP     | Dev   |
| INFRA-T02 | PostgreSQL 16 + pgvector (Docker local + Railway) | 3 SP     | Dev   |
| INFRA-T03 | Redis 7 (Docker local + Railway)                  | 2 SP     | Dev   |

**End of Tuesday:** `docker-compose up` brings up Postgres + Redis; `pnpm install` succeeds across all packages

### Wednesday–Thursday

| Task ID   | Title                                         | Estimate | Owner |
| --------- | --------------------------------------------- | -------- | ----- |
| INFRA-T04 | BullMQ queue topology (5 queues + Bull Board) | 3 SP     | Dev   |
| AUTH-T01  | Clerk SDK + JWT + React auth guards           | 3 SP     | Dev   |
| AUTH-T02  | Fastify JWT middleware + JWKS caching         | 2 SP     | Dev   |
| AUTH-T04  | Rate limiting middleware (100/min)            | 2 SP     | Dev   |

**End of Thursday:** Bull Board visible at `localhost:3001/admin/queues`; Clerk sign-in page loads at `localhost:5173`

### Friday

| Task ID | Title                                              | Estimate | Owner |
| ------- | -------------------------------------------------- | -------- | ----- |
| DB-T01  | `leads` table + `lead_scores` join table migration | 3 SP     | Dev   |
| DB-T02  | `user_profiles` table migration                    | 2 SP     | Dev   |

**Week 1 Deliverable:** Local stack fully operational. All tables migrated. Auth working. BullMQ queues accepting jobs.

---

## Week 2: L1 Ingestion — 5 Phase 1 Sources

**Goal:** 5 live source adapters running, emitting raw leads into PostgreSQL within 5 minutes

### Monday–Tuesday

| Task ID | Title                                     | Estimate | Owner |
| ------- | ----------------------------------------- | -------- | ----- |
| L1-T01  | SourceAdapter TypeScript interface        | 2 SP     | Dev   |
| L1-T02  | IngestionWorker base class + Redis cursor | 3 SP     | Dev   |
| L1-T03  | HN Hiring adapter (Algolia, 6h)           | 3 SP     | Dev   |
| L1-T04  | RemoteOK adapter (RSS, 30min)             | 2 SP     | Dev   |

**End of Tuesday:** HN + RemoteOK leads flowing into `raw.leads` queue; verify with Bull Board

### Wednesday–Thursday

| Task ID | Title                                   | Estimate | Owner |
| ------- | --------------------------------------- | -------- | ----- |
| L1-T05  | WeWorkRemotely adapter (RSS, 30min)     | 2 SP     | Dev   |
| L1-T06  | Reddit r/forhire adapter (OAuth, 30min) | 3 SP     | Dev   |
| L1-T07  | Upwork RSS adapter (30min)              | 3 SP     | Dev   |

**End of Thursday:** All 5 adapters running on schedule; leads visible in raw.leads queue

### Friday — Buffer & Testing

- Manual verification: all 5 adapters produce valid raw lead payloads
- Fix any pagination / rate limit issues discovered
- Write integration tests for 2 most critical adapters (HN + Reddit)

**Week 2 Deliverable:** 5 adapters continuously ingesting leads. Average 50–200 new raw leads per day.

---

## Week 3: L2 Normalization + LLM Provider Setup

**Goal:** Raw leads normalized to 29-field schema; LLMProvider abstraction ready; embeddings generating

### Monday–Tuesday

| Task ID | Title                                     | Estimate | Owner |
| ------- | ----------------------------------------- | -------- | ----- |
| L2-T01  | NormalizationPipeline BullMQ worker       | 3 SP     | Dev   |
| L2-T02  | Lead schema validator (Zod, 29 fields)    | 2 SP     | Dev   |
| L2-T03  | Skills entity extractor (500+ dictionary) | 3 SP     | Dev   |

**End of Tuesday:** Normalized leads appearing in PostgreSQL `leads` table with skills extracted

### Wednesday–Thursday

| Task ID | Title                                       | Estimate | Owner |
| ------- | ------------------------------------------- | -------- | ----- |
| L2-T04  | Budget entity extractor (regex + ranges)    | 3 SP     | Dev   |
| L2-T05  | Location entity extractor                   | 2 SP     | Dev   |
| L3-T01  | LLMProvider abstraction interface           | 2 SP     | Dev   |
| L3-T02  | ClaudeProvider (claude-sonnet-4-6, 3-retry) | 3 SP     | Dev   |

**End of Thursday:** LLMProvider working; test `claude.complete()` with curl; budget + location extracted from sample leads

### Friday

| Task ID | Title                                              | Estimate | Owner |
| ------- | -------------------------------------------------- | -------- | ----- |
| L3-T03  | OpenAIProvider (text-embedding-3-small, batch 100) | 3 SP     | Dev   |
| L2-T08  | Embedding generation for normalized leads          | 3 SP     | Dev   |

**Week 3 Deliverable:** Fully normalized leads with embeddings stored in PostgreSQL. LLMProvider + OpenAIProvider tested.

---

## Week 4: L3 Scoring Engine + Core Enrichment

**Goal:** AI scoring live; leads scored 0-100; golden_hour flag working; company health (Crunchbase) integrated

### Monday–Tuesday

| Task ID | Title                            | Estimate | Owner |
| ------- | -------------------------------- | -------- | ----- |
| L3-T04  | 6-factor scoring algorithm       | 5 SP     | Dev   |
| L3-T05  | AI 3-sentence summary generation | 3 SP     | Dev   |

**End of Tuesday:** Leads scored; summaries generated; verify scores in DB with `psql`

### Wednesday–Thursday

| Task ID  | Title                                          | Estimate | Owner |
| -------- | ---------------------------------------------- | -------- | ----- |
| L3-T06   | Deduplication (30-day pgvector 0.92 threshold) | 5 SP     | Dev   |
| L3-T11   | Golden Hour flag computation (age<2h, count<5) | 2 SP     | Dev   |
| FR02-T01 | Company health — Crunchbase signal (Phase 1)   | 3 SP     | Dev   |

**End of Thursday:** Deduplication working (test with duplicate leads); golden_hour flag set correctly; Crunchbase health check running

### Friday

| Task ID  | Title                                        | Estimate | Owner |
| -------- | -------------------------------------------- | -------- | ----- |
| L4-T01   | Phase 1 stub: scored.leads → outreach.drafts | 3 SP     | Dev   |
| FR02-T07 | Company health 24h Redis cache               | 2 SP     | Dev   |

**Week 4 Deliverable:** Full pipeline working end-to-end: Source → Normalize → Score → Enrich → PostgreSQL. Scores, summaries, golden_hour flags, company health all populated.

---

## Week 5: Profile System + Outreach Generator + Core API

**Goal:** User profile onboarding complete; cold email drafts generating; all core REST API endpoints live

### Monday–Tuesday

| Task ID  | Title                                            | Estimate | Owner |
| -------- | ------------------------------------------------ | -------- | ----- |
| PROF-T01 | UserProfile Zod schema                           | 3 SP     | Dev   |
| PROF-T02 | Profile CRUD API + Clerk webhook auto-create     | 3 SP     | Dev   |
| PROF-T03 | Skills autocomplete (500+ skills.json + fuse.js) | 3 SP     | Dev   |
| PROF-T07 | Profile completeness score (weighted formula)    | 2 SP     | Dev   |

**End of Tuesday:** Profile creation/update API working; Clerk webhook creates profile on new user signup

### Wednesday–Thursday

| Task ID | Title                                       | Estimate | Owner |
| ------- | ------------------------------------------- | -------- | ----- |
| L6-T01  | OutreachContextBuilder                      | 3 SP     | Dev   |
| L6-T02  | Cold email generator (100-160 words)        | 3 SP     | Dev   |
| L6-T06  | Outreach quality validator (banned phrases) | 2 SP     | Dev   |
| L7-T01  | Fastify server + plugins + GET /health      | 3 SP     | Dev   |

**End of Thursday:** Cold email drafts generating for test leads; API health check responding

### Friday

| Task ID | Title                                           | Estimate | Owner |
| ------- | ----------------------------------------------- | -------- | ----- |
| L7-T02  | GET /api/leads (cursor pagination + filters)    | 3 SP     | Dev   |
| L7-T03  | GET /api/leads/:id (auto-status-viewed)         | 2 SP     | Dev   |
| L7-T04  | PATCH /api/leads/:id/status                     | 2 SP     | Dev   |
| L7-T05  | GET /api/leads/:id/outreach (202 async pattern) | 2 SP     | Dev   |
| L7-T08  | GET + PUT /api/profile                          | 3 SP     | Dev   |

**Week 5 Deliverable:** Full API serving leads with pagination, filtering, status updates, and outreach drafts. Profile read/write working. Postman collection verified.

---

## Week 6: React Dashboard + Deploy → Phase 1 MVP 🚀

**Goal:** React dashboard deployed on Vercel; API deployed on Railway; complete Phase 1 MVP

### Monday–Tuesday: Frontend Core

| Task ID | Title                                                              | Estimate | Owner |
| ------- | ------------------------------------------------------------------ | -------- | ----- |
| L7-T12  | Vite + React 18 + Tailwind setup                                   | 2 SP     | Dev   |
| L7-T13  | Zustand + React Query setup                                        | 2 SP     | Dev   |
| L7-T14  | Lead Feed with infinite scroll                                     | 5 SP     | Dev   |
| L7-T15  | Lead Card (all Phase 1 badges: score, golden_hour, company_health) | 5 SP     | Dev   |

**End of Tuesday:** Lead Feed loading data from API; Lead Cards rendering with badges

### Wednesday–Thursday: Detail + Outreach

| Task ID | Title                                                  | Estimate | Owner |
| ------- | ------------------------------------------------------ | -------- | ----- |
| L7-T16  | Lead Detail Panel (slide-over, score breakdown)        | 5 SP     | Dev   |
| L7-T17  | Outreach Draft Modal (cold email, copy, status update) | 5 SP     | Dev   |
| L7-T18  | 5-step Onboarding Wizard UI                            | 5 SP     | Dev   |

**End of Thursday:** Full user flow working: Sign up → Onboarding → Feed → Lead Detail → Copy outreach draft

### Friday: Deploy & Smoke Test

| Task ID   | Title                              | Estimate | Owner  |
| --------- | ---------------------------------- | -------- | ------ |
| INFRA-T05 | Railway deployment (API + Workers) | 2 SP     | DevOps |
| INFRA-T06 | Vercel deployment (Frontend)       | 1 SP     | DevOps |

**Phase 1 MVP Launch Checklist:**

- [ ] All 5 adapters running on Railway cron schedules
- [ ] Leads flowing through full pipeline (Source → DB → Frontend) in < 5 minutes
- [ ] `golden_hour` badges appearing on qualifying leads
- [ ] Company health badges showing for named clients
- [ ] Cold email draft generates in < 3 seconds
- [ ] Profile onboarding wizard completes and saves
- [ ] Dashboard loads in < 2 seconds (LCP)
- [ ] API GET /health returns 200
- [ ] HTTPS on both Railway API and Vercel frontend
- [ ] Clerk auth protecting all API routes

---

## Phase 1 Sprint Summary

| Week   | Focus                        | Story Points | Cumulative |
| ------ | ---------------------------- | ------------ | ---------- |
| Week 1 | Infrastructure + Auth + DB   | 23 SP        | 23 SP      |
| Week 2 | L1 Ingestion (5 sources)     | 18 SP        | 41 SP      |
| Week 3 | L2 Normalization + LLM setup | 21 SP        | 62 SP      |
| Week 4 | L3 Scoring + Enrichment      | 21 SP        | 83 SP      |
| Week 5 | Profile + Outreach + API     | 31 SP        | 114 SP     |
| Week 6 | Frontend + Deploy            | 32 SP        | 146 SP     |

**Total Phase 1: ~146 Story Points**
**Velocity assumption: ~25 SP/week for 1 developer; ~50 SP/week for 2 developers**

---

## Phase 2 Kickoff Criteria (After Week 6)

Phase 2 begins when ALL of the following are confirmed in production:

1. ✅ 100+ leads ingested per day from all 5 sources
2. ✅ Average pipeline latency < 5 minutes (source → dashboard)
3. ✅ AI scoring producing scores across full 0-100 range (not clustered)
4. ✅ At least 3 beta users have completed onboarding and copied outreach drafts
5. ✅ No critical errors in Railway logs for 48 consecutive hours
6. ✅ Phase 2 decisions resolved: DEC-02 (community OAuth), DEC-03 (embedding model choice)

---

## Risk Register (Phase 1)

| Risk                                    | Probability | Impact | Mitigation                                                        |
| --------------------------------------- | ----------- | ------ | ----------------------------------------------------------------- |
| Reddit API rate limits / access denied  | High        | High   | Implement exponential backoff Day 1; have mock data fallback      |
| Claude API latency > 3s on scoring      | Medium      | High   | Implement async scoring (leads visible before score); add timeout |
| pgvector HNSW index slow on first build | Low         | Medium | `CREATE INDEX CONCURRENTLY` — doesn't block writes                |
| Crunchbase API costs exceed budget      | Medium      | Medium | 24h cache; only check named clients (not all leads)               |
| Clerk JWT validation latency            | Low         | Medium | Cache JWKS keys (TTL 1h) in AUTH-T02                              |
| Railway cold starts on workers          | Medium      | Low    | Keep-alive BullMQ workers; use always-on dyno                     |
