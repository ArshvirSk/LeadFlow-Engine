# EPIC: FR-06 — Trigger Event Proactive Outreach

**Phase Scope:** 2 (full feature) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-06

---

## Story FR06-S01: Watchlist & Trigger Event Monitoring (Phase 2)

### FR06-T01 — Watchlist CRUD Backend

_(Schema in DB-T06 — see DB-database-schema.md)_

- **ID:** FR06-T01
- **Phase:** 2
- **Dependencies:** DB-T06, AUTH-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/watchlist` returns all watchlisted companies for user
  2. `POST /api/watchlist` adds company: `{ company_name, company_url, company_crunchbase_id?, notes }`
  3. `DELETE /api/watchlist/:id` removes from watchlist
  4. Max 50 companies per user (free tier); 200 (Pro+)
  5. Can also add from Lead Detail Panel: "Watch {company_name}" button

#### Subtasks:

- Create `packages/api/src/routes/watchlist.ts`
- Implement `watchlistService.ts` with CRUD on `watchlist` table
- On add: trigger immediate trigger event check for company (async, don't block response)
- On delete: cancel any active monitoring jobs for that company
- Add "Watch Company" action to `GET /api/leads/:id` response: `{ watchlist_status: 'watching' | null }`

---

### FR06-T02 — Trigger Event Monitor Worker

_(Extends L5-T01 Watchlist monitor — see L5-passive-discovery.md)_

- **ID:** FR06-T02
- **Phase:** 2
- **Dependencies:** FR06-T01, INFRA-T04
- **Estimate:** 3 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. BullMQ repeatable job: every 2 hours, checks all watchlisted companies for trigger events
  2. Checks 5 event types (see FR06-T03 through FR06-T07)
  3. Each detected event stored in `trigger_events` table with deduplication (event not re-triggered within 30 days)
  4. New trigger event → enqueue proactive lead creation job

#### Subtasks:

- Create `watchlist-monitor.worker.ts` with BullMQ repeatable job (every 2h cron)
- For each watchlisted company: run all 5 trigger event checks in parallel
- Dedup key: `{company_id}:{event_type}:{event_date_week}` → don't re-trigger same week
- On new event: emit to `trigger.events` BullMQ queue
- Worker processes `trigger.events`: create proactive lead + notify user via WebSocket

---

### FR06-T03 — Crunchbase Funding Round Detection

- **ID:** FR06-T03
- **Phase:** 2
- **Dependencies:** FR06-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. For each watchlisted company: poll Crunchbase `/v4/entities/organizations/:permalink/funding_rounds`
  2. Funding round announced within 14 days → trigger `FUNDING_ROUND` event
  3. `trigger_events` record: `{ company_id, event_type: 'FUNDING_ROUND', event_date, event_data: { round_type, amount, lead_investor } }`
  4. Cached: don't re-check same company within 6 hours (unless manually triggered)

#### Subtasks:

- Create `FundingRoundDetector` class in `trigger-detectors/`
- Compare `last_checked_at` vs. `funding_round.announced_on` for recency
- Handle Crunchbase API rate limits: max 200 requests/min shared across all detectors
- Store `latest_funding_round_at` in watchlist record to avoid re-detection

---

### FR06-T04 — Product Hunt Launch Detection

- **ID:** FR06-T04
- **Phase:** 2
- **Dependencies:** FR06-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Poll Product Hunt GraphQL API for posts by maker company domain
  2. Post launched within 7 days AND upvotes ≥ 50 → trigger `PRODUCTHUNT_LAUNCH` event
  3. `event_data: { product_name, upvotes, url, tagline }`
  4. Product Hunt API requires OAuth token stored per user if personal integration

#### Subtasks:

- Create `ProductHuntDetector` — call PH GraphQL API
- Match company to PH maker by domain: `company_url → extract root domain → query maker posts`
- Filter by `created_at > 7 days ago AND votes_count >= 50`
- Store `event_data.upvotes` for inclusion in outreach draft angle

---

### FR06-T05 — GitHub Star Milestone Detection

- **ID:** FR06-T05
- **Phase:** 2
- **Dependencies:** FR06-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Query GitHub API: search repos by company domain → find main repo
  2. Star milestones: 100, 500, 1k, 5k, 10k — trigger `GITHUB_MILESTONE` event when crossed
  3. Milestone stored; never re-triggered for same milestone
  4. `event_data: { repo_name, star_count, milestone }`

#### Subtasks:

- Create `GitHubStarsDetector`
- Map watchlisted company URL → GitHub org or user via `client_url` domain heuristic
- Call `GET /repos/{owner}/{repo}` → compare `stargazers_count` vs. stored baseline
- Store `github_stars_baseline` per watchlisted company; update after check
- Trigger on crossed milestone: `1 - (stars_baseline / milestone) > 0` AND `stars > milestone`

---

### FR06-T06 — Company Blog RSS Monitoring

- **ID:** FR06-T06
- **Phase:** 2
- **Dependencies:** FR06-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. For each watchlisted company URL: attempt to discover RSS feed (`/feed`, `/rss`, `/blog/feed`)
  2. New blog post containing keywords: "hiring", "we're growing", "we're looking for" → `BLOG_HIRING_SIGNAL` event
  3. `event_data: { post_title, post_url, matched_phrase }`
  4. Blog RSS polled every 6h per company

#### Subtasks:

- Create `BlogRSSDetector` with RSS feed auto-discovery
- `rss-parser` to parse feed; check `pubDate` within 7 days
- Keyword scanning on title + description: configurable keyword list
- Store `last_blog_post_url` per company to detect new posts
- Gracefully skip if no RSS feed discoverable

---

## Story FR06-S02: Proactive Lead Creation & Display (Phase 2)

### FR06-T07 — Proactive Lead Creation with Trigger Event

- **ID:** FR06-T07
- **Phase:** 2
- **Dependencies:** FR06-T02, L2-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. On trigger event: create synthetic lead in `leads` table for the watchlisted company
  2. Lead `source = 'proactive_trigger'`; `trigger_event` field populated with event type + summary
  3. Lead title auto-generated: `"[company] recently [event description] — reach out now"`
  4. Lead goes through full enrichment pipeline (scoring, outreach draft generation)
  5. Lead injected into user's feed via WebSocket `lead:new` event

#### Subtasks:

- Create `createTriggerLead(userId, watchlistEntry, triggerEvent)` service
- Construct synthetic lead payload from `trigger_events.event_data`
- Enqueue to `raw.leads` queue for standard normalization/scoring pipeline
- WebSocket push: `lead:new` event with `trigger_event` payload for real-time badge
- Add `source_filter: proactive_trigger` option to `GET /api/leads`

---

### FR06-T08 — Proactive Lead Visual Distinction

- **ID:** FR06-T08
- **Phase:** 2
- **Dependencies:** FR06-T07, L7-T15
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Proactive leads show ⚡ "Proactive" badge with trigger event description
  2. Proactive leads section at top of feed (separate from regular leads)
  3. Trigger event callout card: "Acme Inc just raised $5M Series A — reach out now"
  4. One-click "Draft Message" button pre-fills outreach context with trigger event

#### Subtasks:

- Add `ProactiveBadge` component to `LeadCard`
- Create `ProactiveLeadsSection` at top of `LeadFeed`
- Trigger event banner: colored by event type (green=funding, yellow=product, blue=github, purple=blog)
- "Draft Message" → opens `OutreachDraftModal` with `trigger_event` context pre-loaded

---

### FR06-T09 — Trigger-Specific Outreach Angles

- **ID:** FR06-T09
- **Phase:** 2
- **Dependencies:** FR06-T08, L6-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Outreach draft references trigger event naturally in opening
  2. FUNDING: "Congrats on the [round type] round — you'll likely need [skill] to scale fast…"
  3. PRODUCT LAUNCH: "Saw your launch on Product Hunt — [observation] — I specialize in…"
  4. GITHUB: "Your [repo] just hit [milestone] stars — as it scales, you may need…"
  5. BLOG: "Read your post about [topic] — that's exactly where I can help…"

#### Subtasks:

- Add `trigger_event_context` to `OutreachContext` builder
- System prompt addition: "The company just experienced this trigger event: {eventType} — {eventSummary}. Reference this naturally in the opening."
- Create event-type-specific prompt fragments (map of `eventType → promptFragment`)
- QA: test all 4 event types, verify tone and accuracy

---

### FR06-T10 — Watchlist Management UI

- **ID:** FR06-T10
- **Phase:** 2
- **Dependencies:** FR06-T01, FR06-T08
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `/watchlist` page: table of watched companies with last_event, status, remove button
  2. "Add Company" modal: name + URL, auto-suggests from previous leads
  3. Company card: company name, last trigger event (type + date), active monitoring badge
  4. Event history per company: expandable list of past trigger events
  5. Quick add: "Watch Company" button on Lead Card → adds to watchlist without navigating

#### Subtasks:

- Create `packages/web/src/pages/Watchlist.tsx`
- `WatchlistCompanyCard` component with event history expand/collapse
- `AddCompanyModal` with auto-suggest from `GET /api/leads?distinct=client_name`
- Add "Watch Company" button to `LeadDetailPanel` quick actions
- Event type icons: 💰 funding, 🚀 PH, ⭐ GitHub, 📝 Blog
