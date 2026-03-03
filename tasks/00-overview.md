# LeadFlow Engine — Master Task Overview

**PRD Version:** v1.0 | **Task File Version:** 1.0 | **Generated:** 2026-03-02

---

## Index of EPIC Files

| File                                                               | EPIC                          | Phase Scope |
| ------------------------------------------------------------------ | ----------------------------- | ----------- |
| [INFRA-infrastructure.md](./INFRA-infrastructure.md)               | Infrastructure & DevOps       | 1–4         |
| [AUTH-authentication.md](./AUTH-authentication.md)                 | Authentication & Security     | 1–3         |
| [DB-database-schema.md](./DB-database-schema.md)                   | Database Schema & Migrations  | 1–4         |
| [L1-ingestion-layer.md](./L1-ingestion-layer.md)                   | L1: Ingestion Workers         | 1–2         |
| [L2-normalization-pipeline.md](./L2-normalization-pipeline.md)     | L2: Normalization Pipeline    | 1–2         |
| [L3-ai-scoring-engine.md](./L3-ai-scoring-engine.md)               | L3: AI Scoring Engine         | 1–4         |
| [L4-automation-engine.md](./L4-automation-engine.md)               | L4: Automation Engine         | 1–4         |
| [L5-passive-discovery.md](./L5-passive-discovery.md)               | L5: Passive Discovery Layer   | 2–4         |
| [L6-outreach-generator.md](./L6-outreach-generator.md)             | L6: Outreach Generator        | 1–4         |
| [L7-api-frontend.md](./L7-api-frontend.md)                         | L7: API + Frontend            | 1–4         |
| [PROFILE-freelancer-profile.md](./PROFILE-freelancer-profile.md)   | Freelancer Profile Engine     | 1–3         |
| [FR01-golden-hour-alert.md](./FR01-golden-hour-alert.md)           | FR-01: Golden Hour Alert      | 1–2         |
| [FR02-dead-company-filter.md](./FR02-dead-company-filter.md)       | FR-02: Dead Company Filter    | 1–2         |
| [FR03-portfolio-auto-match.md](./FR03-portfolio-auto-match.md)     | FR-03: Portfolio Auto-Match   | 2           |
| [FR04-send-window-optimizer.md](./FR04-send-window-optimizer.md)   | FR-04: Send Window Optimizer  | 2           |
| [FR05-boomerang-detector.md](./FR05-boomerang-detector.md)         | FR-05: Boomerang Detector     | 2           |
| [FR06-trigger-event-outreach.md](./FR06-trigger-event-outreach.md) | FR-06: Trigger Event Outreach | 2           |
| [FR07-alliance-mode.md](./FR07-alliance-mode.md)                   | FR-07: Alliance Mode          | 3–4         |
| [FR08-win-loss-debrief.md](./FR08-win-loss-debrief.md)             | FR-08: Win/Loss AI Debrief    | 2           |
| [FR09-autopilot-mode.md](./FR09-autopilot-mode.md)                 | FR-09: Autopilot Mode         | 3           |
| [FR10-browser-extension.md](./FR10-browser-extension.md)           | FR-10: Browser Extension      | 3–4         |
| [FR11-nl-lead-search.md](./FR11-nl-lead-search.md)                 | FR-11: NL Lead Search         | 2           |
| [FR12-community-lead-mining.md](./FR12-community-lead-mining.md)   | FR-12: Community Lead Mining  | 3–4         |
| [FR13-morning-briefing.md](./FR13-morning-briefing.md)             | FR-13: Morning Briefing       | 3           |
| [ANALYTICS-dashboard.md](./ANALYTICS-dashboard.md)                 | Analytics Dashboard           | 2–3         |

---

## Critical Path — Phase 1 MVP (Minimum Viable Sequence)

The following tasks MUST be completed in this order before Phase 1 is considered deliverable.
A task at each level cannot begin until all tasks above it are complete.

```
INFRA-T01 → INFRA-T02 → INFRA-T03 → INFRA-T04
                ↓
           DB-T01 → DB-T02
                ↓
           AUTH-T01 → AUTH-T02 → AUTH-T04
                ↓
           L1-T01 (SourceAdapter interface)
                ↓
    ┌──────────────────────┐
    L1-T03 (HN)            L1-T04 (RemoteOK)
    L1-T05 (WeWorkRemotely) L1-T06 (Reddit)
    L1-T07 (Upwork)
    └──────────────────────┘
                ↓
           L2-T01 → L2-T02 → L2-T03 → L2-T04
                ↓
           L3-T01 (LLMProvider) → L3-T02 (Claude) → L3-T03 (OpenAI embeddings)
                ↓
           L3-T04 (scoring algo) + L3-T05 (summary) + L3-T06 (dedup)
                ↓
           L3-T11 (golden hour flag) + FR02-T01 (Crunchbase health check)
                ↓
           L6-T01 (OutreachContextBuilder) → L6-T02 (cold email)
                ↓
           PROF-T01 → PROF-T02 → PROF-T03 (skills autocomplete)
                ↓
           L7-T01 → L7-T02 → L7-T03 → L7-T04 (Fastify + middleware)
                ↓
    L7-T05 + L7-T06 + L7-T07 + L7-T08 + L7-T11 (core API endpoints)
                ↓
    FE-T01 → FE-T02 → FE-T03 (frontend scaffold + auth)
                ↓
    FE-T04 + FE-T05 + FE-T06 + FE-T07 + FE-T08 + FE-T09 (dashboard UI)
                ↓
           INFRA-T05 + INFRA-T06 (deploy to Railway + Vercel)
                ↓
           ✅ PHASE 1 MVP — Beta users can ingest, score, and approve cold email drafts
```

---

## Pre-Development Decisions Required

| ID         | Decision                                   | Blocker For    | Options                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DEC-01** | User-scoped scoring table design           | DB-T01, L3-T04 | (A) `lead_scores(lead_id, user_id, score, breakdown)` join table — most correct but complex; (B) Score stored inline on leads table with `user_id` FK — simpler but leads table grows per-user; **Recommendation: Option A** |
| **DEC-02** | NLP entity extraction model                | L2-T03, L2-T04 | (A) spaCy via Python microservice; (B) Claude API calls (higher cost, higher quality); (C) Regex heuristics for Phase 1, upgrade to Claude in Phase 2; **Recommendation: Option C for Phase 1**                              |
| **DEC-03** | Monorepo vs. polyrepo structure            | INFRA-T01      | (A) pnpm monorepo (frontend + api + workers + extension in one repo); (B) Separate repos; **Recommendation: pnpm monorepo — simpler CI and shared types**                                                                    |
| **DEC-04** | Community lead mining privacy architecture | FR12-T01       | (A) Server reads all messages, filters server-side; (B) Client-side pre-filter, only intent messages sent to server; **PRD mandates B — confirm implementation approach**                                                    |
| **DEC-05** | Alliance success fee billing               | FR07-T09       | (A) Stripe integration in-app; (B) External invoice with honor system; (C) Defer to post-v1; **PRD conflict with no-payment-processing scope — needs product decision**                                                      |
| **DEC-06** | Lead archival strategy                     | DB-T09         | (A) Hard delete after 180 days; (B) Move to cold storage (S3/Glacier) table; (C) Partition and compress; **Recommendation: Option B for boomerang history integrity**                                                        |

---

## External Dependencies to Resolve Before Phase 1

| Dependency                       | Risk   | Action Required                                                                    | Blocks                          |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------- | ------------------------------- |
| **Anthropic Claude API key**     | Low    | Create Anthropic account, set spend limit, store as env var                        | L3-T02, L6-T02                  |
| **OpenAI API key** (embeddings)  | Low    | Create OpenAI account for `gemini-embedding-001`, set spend limit                  | L3-T03, DB-T04                  |
| **Crunchbase API account**       | High   | Paid plan required for company health data. Evaluate Basic ($29/mo) vs. Enterprise | FR02-T01                        |
| **Reddit API OAuth credentials** | Medium | Register app at reddit.com/prefs/apps; OAuth2 client credentials                   | L1-T06                          |
| **Clerk account**                | Low    | Create Clerk project; configure JWT template; get publishable + secret keys        | AUTH-T01                        |
| **Railway account**              | Low    | Create Railway project; provision PostgreSQL + Redis instances                     | INFRA-T02, INFRA-T03, INFRA-T05 |
| **Vercel account**               | Low    | Connect repo; configure env vars                                                   | INFRA-T06                       |
| **Resend API key**               | Low    | Create Resend account; verify sending domain                                       | FR13-T04                        |
| **Product Hunt API key**         | Low    | Create PH developer account                                                        | L1-T21, FR06-T03                |
| **GitHub personal access token** | Low    | For GitHub Search API (5,000 req/hr authenticated)                                 | L1-T26, FR06-T04                |
| **Datadog account**              | Medium | APM + log forwarding; free tier sufficient for MVP                                 | INFRA-T07                       |
| **LinkedIn data access**         | High   | No official public job scraping API. Evaluate RSS bridges. Legal review needed     | L1-T18                          |
| **Slack API app**                | Low    | Create Slack app at api.slack.com for FR-12 OAuth                                  | FR12-T01                        |
| **Discord application**          | Low    | Create Discord bot at discord.com/developers                                       | FR12-T03                        |

---

## Parallelizable Tasks Within Phase 1

After INFRA-T01 through INFRA-T04 complete, these tracks can proceed in parallel:

**Track A — Backend Foundation** (Backend engineer)

- DB-T01, DB-T02 → L1-T01 → L1 adapters (T03–T07) → L2-T01 through L2-T05

**Track B — AI Pipeline** (AI/Backend engineer)

- L3-T01 → L3-T02 → L3-T03 → L3-T04 → L3-T05 → L3-T06

**Track C — API Layer** (Backend engineer)

- AUTH-T01 → AUTH-T02 → AUTH-T04 → L7-T01 through L7-T11

**Track D — Frontend** (Frontend engineer)

- Can begin FE-T01, FE-T02, FE-T03 as soon as API contracts are documented
- FE-T04 through FE-T09 can be built against mock API data

**Track E — Outreach + Profile** (Full-stack engineer)

- PROF-T01, PROF-T02 → L6-T01 → L6-T02

---

## Story Point Summary by Phase

| Phase               | Total SP    | Key Deliverables                                                          |
| ------------------- | ----------- | ------------------------------------------------------------------------- |
| Phase 1 (Wks 1–6)   | ~155 SP     | 5 sources, scoring, cold email, basic dashboard, FR-01 badge, FR-02 basic |
| Phase 2 (Wks 7–12)  | ~220 SP     | All 20+ sources, 4 outreach formats, FR-01–FR-06, FR-08, FR-11, WebSocket |
| Phase 3 (Wks 13–18) | ~210 SP     | FR-07, FR-09, FR-10, FR-12, FR-13, Full Analytics                         |
| Phase 4 (Wks 19–24) | ~150 SP     | Mobile, Firefox extension, Telegram, direct sends, Alliance billing       |
| **Total**           | **~735 SP** | Full platform                                                             |
