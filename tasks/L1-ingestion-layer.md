# EPIC: L1 — Ingestion Layer (Workers)

**Phase Scope:** 1–2 | **Owner:** Backend
**PRD Reference:** Section 5 — Lead Sources & Ingestion Layer

---

## Story L1-S01: SourceAdapter Interface Contract

_As a developer, I can add any new lead source by implementing a single interface without touching the normalization or scoring layers._

### L1-T01 — Define SourceAdapter TypeScript Interface

- **ID:** L1-T01
- **Phase:** 1
- **Dependencies:** INFRA-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `SourceAdapter` interface defined in `packages/types/src/adapters.ts`
  2. All 5 required members present: `id`, `poll()`, `normalize()`, `healthCheck()`, `schedule`
  3. Interface enforced via TypeScript — compilation fails if any adapter omits a required member
  4. Exported from `packages/types` index for use by all worker packages

#### Subtasks:

- Define interface in `packages/types/src/adapters.ts`:
  ```typescript
  export interface SourceAdapter {
    id: string; // e.g. 'remoteok', 'reddit_forhire'
    schedule: string; // cron expression, e.g. '*/30 * * * *'
    poll(): Promise<RawLeadItem[]>;
    normalize(rawItem: RawLeadItem): Partial<Lead>;
    healthCheck(): Promise<SourceHealthStatus>;
  }
  export interface RawLeadItem {
    rawId: string; // source-specific ID for dedup cursor
    raw: Record<string, unknown>; // full raw payload
    fetchedAt: Date;
  }
  export type SourceHealthStatus = "healthy" | "degraded" | "down";
  ```
- Export from `packages/types/src/index.ts`
- Write TypeScript compilation test that fails if interface broken
- Document interface contract in `packages/workers/README.md`

---

## Story L1-S02: Ingestion Worker Base Infrastructure

_As the system, I process raw lead events from all sources through a common BullMQ worker pipeline._

### L1-T02 — Ingestion Worker Base Class & Cron Scheduler

- **ID:** L1-T02
- **Phase:** 1
- **Dependencies:** L1-T01, INFRA-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `IngestionWorker` base class handles scheduling via BullMQ + cron
  2. Each adapter's `poll()` result is published to `raw.leads` queue as individual jobs
  3. Last cursor (most recent `rawId`) persisted in Redis to avoid re-processing duplicates
  4. Worker is stateless — restarting a worker processes missed items, not duplicates

#### Subtasks:

- Create `packages/workers/src/ingestion/IngestionWorker.ts` base class
- Implement `startPolling()` method: use `node-cron` + adapter's `schedule`
- Implement cursor management: `GET/SET redis:cursor:{adapter.id}` before/after each poll
- Implement `publishToQueue()`: enqueue each `RawLeadItem` as `raw.leads` BullMQ job
- Handle empty poll response gracefully (no error, update cursor timestamp)
- Handle adapter errors: catch exception, log error, retry on next scheduled run
- Write unit test: mock adapter, verify cursor advances, verify correct number of jobs enqueued

---

## Story L1-S03: Phase 1 Source Adapters (5 Sources)

_As Autopilot, I ingest leads from the 5 core Phase 1 sources._

### L1-T03 — HN Hiring Adapter (Algolia API)

- **ID:** L1-T03
- **Phase:** 1
- **Dependencies:** L1-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Polls Algolia HN Search API for the current month's "Who is Hiring?" thread
  2. Individual comment/item records parsed as separate raw lead items
  3. Respects Algolia API rate limits (1 req/sec)
  4. Adapter health check verifies Algolia API is reachable

#### Subtasks:

- Create `packages/workers/src/adapters/hn-hiring.adapter.ts`
- Implement `poll()`: query `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_XXXXX` for current month's thread
- Detect current month's "Who is Hiring?" story ID (query for `hn_hiring` story monthly)
- Implement `normalize()`: map HN comment fields to Lead partial schema
- Set `schedule = '0 */6 * * *'` (every 6 hours)
- Write unit test with mocked Algolia response fixture
- Write healthCheck: `GET https://hn.algolia.com/api/v1/search?query=test` → status check

---

### L1-T04 — RemoteOK RSS Adapter

- **ID:** L1-T04
- **Phase:** 1
- **Dependencies:** L1-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Polls `https://remoteok.com/remote-jobs.rss` every 30 minutes
  2. Extracts: title, description, URL, tags (→ skills_required), salary range (→ budget)
  3. Cursor based on `pubDate` — only new items since last poll are enqueued
  4. Adapter handles RSS feed downtime gracefully (returns empty array, logs warning)

#### Subtasks:

- Create `packages/workers/src/adapters/remoteok.adapter.ts`
- Use `rss-parser` to fetch and parse feed
- Implement cursor: last seen `pubDate` stored in Redis as ISO string
- Map RSS fields: `<title>` → title, `<description>` → description, `<link>` → url, `<tags>` → skills_required
- Parse salary from description using regex: `$N–$M`, `$N/hr`, etc.
- Set `schedule = '*/30 * * * *'`
- Write unit test with mocked RSS fixture

---

### L1-T05 — We Work Remotely RSS Adapter

- **ID:** L1-T05
- **Phase:** 1
- **Dependencies:** L1-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Polls `https://weworkremotely.com/remote-jobs.rss` every 30 minutes
  2. Category tags extracted as skills
  3. Handles 200+ items in single feed without memory issues (streaming parse)
  4. healthCheck() returns 'down' if feed returns non-200

#### Subtasks:

- Create `packages/workers/src/adapters/weworkremotely.adapter.ts`
- Stream RSS parse using `rss-parser` with cursor on `pubDate`
- Extract `<category>` as `skills_required`
- Handle multiple WWR feeds (programming, design, devops) as separate polls
- Set `schedule = '*/30 * * * *'`
- Unit test with fixture

---

### L1-T06 — Reddit r/forhire Adapter (Reddit OAuth)

- **ID:** L1-T06
- **Phase:** 1
- **Dependencies:** L1-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Authenticates via Reddit OAuth2 client credentials flow
  2. Polls `r/forhire`, `r/freelance`, `r/webdev` using `new` listing endpoint
  3. Filters for posts with `[HIRING]` flair or keyword patterns
  4. Respects Reddit API rate limits (60 requests/min for OAuth apps)

#### Subtasks:

- Create `packages/workers/src/adapters/reddit-forhire.adapter.ts`
- Implement Reddit OAuth2 token fetch using client credentials
- Token refresh: cache token in Redis, refresh 60s before expiry
- Call `GET /r/forhire/new.json?limit=100&after={cursor}`
- Filter: only posts with flair `[HIRING]` or title containing hiring keywords
- Map fields: title → title, selftext → description, url → url, created_utc → created_at
- Set `schedule = '*/15 * * * *'` (Reddit updates fast)
- Write unit test with mocked Reddit API response
- Write healthCheck: verify OAuth token fetch succeeds

---

### L1-T07 — Upwork RSS Adapter

- **ID:** L1-T07
- **Phase:** 1
- **Dependencies:** L1-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Polls Upwork public RSS feed filtered by relevant categories
  2. Budget extracted from RSS item description when present
  3. Bid count extracted where available (may not be in RSS — set to null)
  4. Handles Upwork rate limiting with exponential backoff

#### Subtasks:

- Create `packages/workers/src/adapters/upwork.adapter.ts`
- Identify working Upwork RSS endpoints (test category-specific feeds)
- Implement budget regex parser on description field
- Set `schedule = '*/30 * * * *'`
- Add headers: `User-Agent: LeadFlow/1.0 (+https://leadflow.dev)`
- Unit test with mocked RSS fixture

---

## Story L1-S04: Phase 2 Source Adapters (15 Additional Sources)

### L1-T08 — Remotive REST API Adapter

- **ID:** L1-T08
- **Phase:** 2
- **Dependencies:** L1-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Polls `https://remotive.com/api/remote-jobs` every 60 minutes
  2. Category and tags mapped to `skills_required`
  3. healthCheck verifies API endpoint

#### Subtasks:

- Create `packages/workers/src/adapters/remotive.adapter.ts`
- Use Remotive REST API (no auth required for public jobs)
- Cursor on `publication_date`; set `schedule = '0 * * * *'`

---

### L1-T09 — Stack Overflow Jobs RSS Adapter

- **ID:** L1-T09
- **Phase:** 2
- **Dependencies:** L1-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Polls tag-filtered Stack Overflow Jobs RSS (or mirror feed)
  2. Technology tags mapped to skills_required
  3. Remote filter applied where available

#### Subtasks:

- Create `packages/workers/src/adapters/stackoverflow-jobs.adapter.ts`
- Use tag-filtered RSS: `https://stackoverflow.com/jobs/feed?r=true&tech=javascript`
- Set `schedule = '0 * * * *'`

---

### L1-T10 — Freelancer.com REST API Adapter

- **ID:** L1-T10
- **Phase:** 2
- **Dependencies:** L1-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Authenticates with Freelancer.com free-tier REST API
  2. Fetches active projects with budget and skill data
  3. bid_count mapped to `applicant_count`
  4. Rate limits respected (free tier: 100 req/hr)

#### Subtasks:

- Create `packages/workers/src/adapters/freelancer-com.adapter.ts`
- Implement Freelancer.com OAuth or API key auth
- Map `budget.minimum`/`maximum` to `budget` field
- Map `bid_stats.bid_count` to `applicant_count`
- Set `schedule = '*/30 * * * *'`

---

### L1-T11 through L1-T25 — Remaining Phase 2 Adapters

Each following adapter follows the same pattern: implement `SourceAdapter` interface, write unit tests with fixtures, document schedule.

| ID     | Adapter                       | Source                                            | Schedule       | Est  |
| ------ | ----------------------------- | ------------------------------------------------- | -------------- | ---- |
| L1-T11 | fiverr-business.adapter.ts    | Fiverr Business buyer requests (Puppeteer scrape) | `0 */2 * * *`  | 3 SP |
| L1-T12 | peopleperhour.adapter.ts      | PeoplePerHour RSS                                 | `*/30 * * * *` | 2 SP |
| L1-T13 | contra.adapter.ts             | Contra public project feed (REST API)             | `0 * * * *`    | 2 SP |
| L1-T14 | guru.adapter.ts               | Guru RSS                                          | `0 * * * *`    | 2 SP |
| L1-T15 | 99designs.adapter.ts          | 99designs listing scrape (Playwright)             | `0 */2 * * *`  | 3 SP |
| L1-T16 | toptal.adapter.ts             | Toptal RSS + Playwright scrape                    | `0 */2 * * *`  | 3 SP |
| L1-T17 | reddit-keywords.adapter.ts    | All Reddit keyword scan (hire/dev/MVP)            | `*/15 * * * *` | 3 SP |
| L1-T18 | linkedin-jobs.adapter.ts      | LinkedIn RSS bridge or authorized scrape          | `0 */2 * * *`  | 5 SP |
| L1-T19 | twitter-search.adapter.ts     | Twitter/X Search API v2                           | `*/30 * * * *` | 3 SP |
| L1-T20 | indiehackers.adapter.ts       | IndieHackers RSS                                  | `0 */2 * * *`  | 2 SP |
| L1-T21 | producthunt.adapter.ts        | Product Hunt API (upcoming + new launches)        | `0 */2 * * *`  | 3 SP |
| L1-T22 | crunchbase-news.adapter.ts    | Crunchbase News RSS                               | `0 */2 * * *`  | 3 SP |
| L1-T23 | techcrunch-funding.adapter.ts | TechCrunch funding tag RSS                        | `0 * * * *`    | 2 SP |
| L1-T24 | venturebeat.adapter.ts        | VentureBeat RSS                                   | `0 * * * *`    | 2 SP |
| L1-T25 | wellfound.adapter.ts          | AngelList/Wellfound job listings                  | `0 */2 * * *`  | 3 SP |

---

### L1-T26 — GitHub Signals Adapter

- **ID:** L1-T26
- **Phase:** 2
- **Dependencies:** L1-T02
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Queries GitHub Search API for repos with `help wanted`, `bounty`, `hire`/`freelancer` in README
  2. Cross-references with Crunchbase for funded org repos
  3. Respects GitHub API rate limits (5,000 req/hr authenticated)
  4. Solo repo detection heuristics (< 3 contributors, recent activity)

#### Subtasks:

- Create `packages/workers/src/adapters/github-signals.adapter.ts`
- Implement 5 signal types as separate search queries
- Use GitHub Search API: `search/issues?q=label:help-wanted`, `search/code?q=bounty+in:readme`
- Authenticate with personal access token for rate limit increase
- Map GitHub API fields to Lead schema
- Set `schedule = '0 */2 * * *'`

---

### L1-T27 — Source Health Check Monitor

- **ID:** L1-T27
- **Phase:** 2
- **Dependencies:** L1-T02, INFRA-T08
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. All registered adapters' `healthCheck()` called every 30 minutes
  2. Consecutive failure count tracked per adapter in Redis
  3. Alert triggered on 3rd consecutive failure
  4. Health status surfaced in admin API endpoint

#### Subtasks:

- Create `SourceHealthWorker` that iterates all registered adapters
- Register adapters in central `adapterRegistry` map
- Store health results in Redis: `health:{adapterId}` → `{ status, consecutiveFailures, lastChecked }`
- Trigger Datadog alert when `consecutiveFailures >= 3`
- Expose `GET /admin/sources/health` endpoint (admin-only)
