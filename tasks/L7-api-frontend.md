# EPIC: L7 — API + Frontend

**Phase Scope:** 1–4 | **Owner:** Full-stack / Frontend / Backend
**PRD Reference:** Sections 11–12

---

## Story L7-S01: Fastify API Foundation

### L7-T01 — Fastify Project Setup + Core Plugins

- **ID:** L7-T01
- **Phase:** 1
- **Dependencies:** INFRA-T01, AUTH-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Fastify server starts and responds to `GET /health` in < 50ms
  2. All plugins registered: auth, rate-limit, CORS, compression, request logger
  3. TypeScript strict mode enabled; all request/reply types annotated
  4. `GET /health` returns: `{ status: 'ok', db: 'connected', redis: 'connected', version: string }`

#### Subtasks:

- Create `packages/api/src/server.ts` with Fastify instantiation
- Register plugins: `@fastify/cors`, `@fastify/compress`, `fastify-plugin`, `@fastify/swagger`
- Register auth middleware (AUTH-T02)
- Register rate limiting (AUTH-T04)
- Configure request logging with Pino (structured JSON)
- Implement `GET /health` with DB + Redis connectivity checks
- Generate OpenAPI schema from route decorators (`@fastify/swagger`)
- Write smoke test: server starts, health check returns 200

---

### L7-T02 — Lead Feed Endpoint — GET /api/leads

- **ID:** L7-T02
- **Phase:** 1
- **Dependencies:** L7-T01, DB-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Returns paginated leads for authenticated user, sorted by `ai_score DESC`
  2. Supports filter params: `source`, `min_score`, `max_age_hours`, `golden_hour`, `boomerang`, `status`
  3. Response includes `lead_scores` data joined (score, summary, breakdown)
  4. p99 latency < 300ms at 10k leads per user

#### Subtasks:

- Define Zod request schema for all query params
- Build parameterized SQL query joining `leads` + `lead_scores` filtered by `user_id`
- Implement cursor-based pagination (`cursor` param = last lead's `id + score`)
- Add `Cache-Control: private, max-age=60` header
- Return envelope: `{ leads: Lead[], nextCursor: string|null, total: number }`
- Write integration test: seed 20 leads, query with filters, verify pagination

---

### L7-T03 — Lead Detail Endpoint — GET /api/leads/:id

- **ID:** L7-T03
- **Phase:** 1
- **Dependencies:** L7-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Returns full lead with all enriched fields + user-specific score breakdown
  2. Updates `lead_scores.status` from `new` to `viewed` on first access
  3. Response < 500ms (all data pre-joined in single query)
  4. 404 returned if lead not found or doesn't belong to requesting user's feed

#### Subtasks:

- Build query: `SELECT l.*, ls.* FROM leads l JOIN lead_scores ls ON l.id=ls.lead_id WHERE l.id=$1 AND ls.user_id=$2`
- On first read: `UPDATE lead_scores SET status='viewed', viewed_at=NOW() WHERE lead_id=$1 AND user_id=$2`
- Return 404 if no row found
- Write test: first access changes status to viewed

---

### L7-T04 — Lead Status Update — PATCH /api/leads/:id/status

- **ID:** L7-T04
- **Phase:** 1
- **Dependencies:** L7-T03
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Accepts: `{ status: 'contacted' | 'won' | 'lost' | 'dismissed' }` body
  2. Validates status transition (e.g., can't go from `won` to `new`)
  3. When `status = 'won' | 'lost'`: triggers Win/Loss debrief job (FR08-T02)
  4. Response returns updated lead with new status

#### Subtasks:

- Define status transition matrix: `{ new: ['viewed'], viewed: ['contacted', 'dismissed'], contacted: ['replied', 'won', 'lost'], ... }`
- Update `lead_scores.status` and `status_updated_at`
- If `won` or `lost`: publish `debrief.generate:{leadId}:{userId}` job
- Return updated lead object
- Write tests for valid + invalid transitions

---

### L7-T05 — Outreach Drafts Endpoint — GET /api/leads/:id/outreach

- **ID:** L7-T05
- **Phase:** 1
- **Dependencies:** L7-T03, L6-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Returns all 4 outreach formats for a lead
  2. If drafts not yet generated: triggers generation and returns `{ status: 'generating' }` with 202
  3. Client polls until drafts ready (or WebSocket push in Phase 2)
  4. User edits to drafts persisted via `PATCH` on same endpoint

#### Subtasks:

- Check `lead_scores.outreach_drafts` field for existing drafts
- If null: enqueue `outreach.drafts:{leadId}:{userId}` job, return 202 with `{ status: 'generating', jobId }`
- If present: return `{ email, linkedin, twitter, clipboard }` with 200
- Add `PATCH /api/leads/:id/outreach` to save user edits (preserve across snooze/reopen)
- Write test: first call returns 202, second call (after mock job completes) returns 200

---

### L7-T06 — Outreach Regenerate — POST /api/leads/:id/outreach/regenerate

- **ID:** L7-T06
- **Phase:** 2
- **Dependencies:** L7-T05, L6-T08
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Accepts `{ format: 'email'|'linkedin'|'twitter'|'clipboard' }` body
  2. Triggers regeneration job for specified format only
  3. New draft replaces old one in `outreach_drafts`
  4. Rate-limited: max 5 regenerations per lead per user per day

#### Subtasks:

- Enqueue `outreach.regenerate:{leadId}:{userId}:{format}` job
- Track regeneration count in Redis: `regen_count:{userId}:{leadId}` with 24h TTL
- Return 429 if regeneration count > 5
- Return 202 with job ID

---

### L7-T07 — Outreach Send — POST /api/outreach/send

- **ID:** L7-T07
- **Phase:** 2
- **Dependencies:** L7-T05, L4-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Accepts: `{ leadId, format, sendNow: boolean, scheduledFor?: ISO8601 }`
  2. If `sendNow=true`: sends immediately (Phase 4 direct email/LinkedIn) or copies to clipboard
  3. If `sendNow=false`: schedules BullMQ delayed job
  4. Returns `{ jobId, scheduledFor }` for scheduled sends

#### Subtasks:

- Parse request: validate `leadId`, `format`, time
- If `scheduledFor` null: compute via `SendWindowOptimizer`
- Create BullMQ delayed job in `scheduled.sends` queue
- Store in `approval_queue` table for tracking
- Return `{ jobId, scheduledFor }` response

---

### L7-T08 — Profile Endpoints — GET/PUT /api/profile

- **ID:** L7-T08
- **Phase:** 1
- **Dependencies:** L7-T01, PROF-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/profile` returns full user profile with all sections
  2. `PUT /api/profile` updates profile and triggers re-embedding if skills or portfolio changed
  3. Partial updates supported (only changed fields in body)
  4. Profile returned in < 100ms (cached in Redis with 5-min TTL)

#### Subtasks:

- Implement `GET /api/profile`: join `user_profiles` + `portfolio_pieces`
- Implement `PUT /api/profile`: partial update with Zod validation
- On update: check if `primary_skills` or `secondary_skills` changed → enqueue `profile.re-embed:{userId}` job
- Cache profile in Redis: `profile:{userId}` → TTL 5 min, invalidate on update
- Write integration tests

---

### L7-T09 — Analytics Endpoints

- **ID:** L7-T09
- **Phase:** 2
- **Dependencies:** L7-T01, DB-T10
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/analytics/summary` returns: total_leads, golden_hour_hit_rate, outreach_draft_acceptance_rate, avg_score
  2. `GET /api/analytics/winloss` returns win/loss breakdown by source, category, budget_range, skill_type
  3. Both endpoints use read replica (Phase 4) or standard DB
  4. Response cached for 15 minutes

#### Subtasks:

- Implement analytics aggregate queries (grouped stats from `lead_scores` table)
- Build `GET /api/analytics/summary` with 30-day window default
- Build `GET /api/analytics/winloss` with dimension breakdowns
- Add `?period=7d|30d|90d|all` query param
- Cache results in Redis with 15-min TTL

---

### L7-T10 — WebSocket Server (Socket.io)

- **ID:** L7-T10
- **Phase:** 2
- **Dependencies:** L7-T01, INFRA-T03
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Socket.io server authenticated (Clerk JWT in handshake)
  2. Each user connected to their own room (`room:{userId}`)
  3. Events pushed: `lead.new`, `lead.golden_hour`, `lead.boomerang`, `autopilot.queued`
  4. WebSocket message delivery < 200ms from event emission to client receipt

#### Subtasks:

- Install `socket.io` in API package
- Attach Socket.io to Fastify server instance
- Auth middleware: validate JWT in `auth` handshake query or cookie
- Join user to `room:${userId}` on connection
- Create `WebSocketEmitter` service: `emit(userId, event, data)`
- Publish events from worker processes via Redis pub/sub → API process → Socket.io room
- Reconnection handling: emit buffered events on reconnect (last 5 min)
- Write integration test: connect client, emit event, verify client receives within 200ms

---

### L7-T11 — Alliance Suggestions Endpoint

- **ID:** L7-T11
- **Phase:** 3
- **Dependencies:** L7-T01, FR07-T03
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/alliance/suggestions/:leadId` returns top 3 Alliance members per skill gap
  2. Results sorted by: community_rating DESC, response_rate DESC, timezone_overlap DESC
  3. Only opt-in Alliance members with `available=true` returned
  4. Caller's own profile excluded from results

#### Subtasks:

- Implement skill gap detection: `skills_required MINUS user.primary_skills MINUS user.secondary_skills`
- Query `alliance_members` for each gap skill
- Sort by composite score: `(rating * 0.5) + (response_rate * 0.3) + (tz_overlap * 0.2)`
- Return `{ skill_gap: string, suggestions: AllianceMember[] }[]`

---

## Story L7-S02: React Dashboard Frontend

### L7-T12 — Vite + React 18 + TailwindCSS Setup

- **ID:** L7-T12
- **Phase:** 1
- **Dependencies:** INFRA-T01
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Vite dev server starts in < 2 seconds with HMR working
  2. TailwindCSS configured with custom color tokens matching design system
  3. Path aliases configured: `@components`, `@hooks`, `@lib`, `@types`
  4. Production build outputs to `dist/` with < 500KB initial bundle (code-split)

#### Subtasks:

- Init Vite React TypeScript project in `packages/web`
- Configure Tailwind with custom colors: score badge colors (green/yellow/red), golden hour amber
- Set up `tsconfig.json` with path aliases
- Configure code splitting: React lazy + Suspense for route-level chunks
- Set up `packages/web/src/lib/api.ts` with typed fetch wrapper using `VITE_API_URL`

---

### L7-T13 — State Management Setup (Zustand + React Query)

- **ID:** L7-T13
- **Phase:** 1
- **Dependencies:** L7-T12
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Zustand store defined for: auth state, UI state (drawer open, active lead, filters)
  2. React Query configured with: stale time 60s, cache time 5m, retry 2
  3. React Query DevTools enabled in development
  4. All API calls use typed React Query hooks (no raw fetch in components)

#### Subtasks:

- Install Zustand, React Query, `@tanstack/react-query-devtools`
- Create `packages/web/src/store/ui.store.ts` with Zustand
- Create `packages/web/src/lib/queryClient.ts` with React Query config
- Create typed hooks: `useLeads()`, `useLead(id)`, `useProfile()`, `useAnalytics()`
- Wrap app in `<QueryClientProvider>` and `<ClerkProvider>`

---

### L7-T14 — Lead Feed Main View

- **ID:** L7-T14
- **Phase:** 1
- **Dependencies:** L7-T13, L7-T02
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Scrollable lead feed displays scored leads sorted by score
  2. New leads appear at top via WebSocket push without page refresh (Phase 2 — stub in Phase 1)
  3. Filters bar: source, min_score slider, age range, lead type (golden_hour, boomerang, community, proactive)
  4. Feed loads first 20 leads in < 2 seconds (LCP)

#### Subtasks:

- Create `packages/web/src/pages/Feed.tsx`
- Implement `LeadFeed` component with infinite scroll (React Query `useInfiniteQuery`)
- Create filter bar component with all filter controls
- Implement NL Search input (Phase 2 — placeholder in Phase 1)
- Loading skeleton while fetching (prevent layout shift)
- Write Playwright e2e test: feed loads with at least 5 lead cards

---

### L7-T15 — Lead Card Component

- **ID:** L7-T15
- **Phase:** 1
- **Dependencies:** L7-T14
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. All badge types rendered: score (colored 0–100), golden_hour (flame + countdown), boomerang, community, proactive, company_health
  2. AI summary shown inline (3 sentences)
  3. Skill match chips highlighted with match count
  4. Quick action buttons: Email, LinkedIn, DM, Copy, Alliance (grayed if unavailable)

#### Subtasks:

- Create `packages/web/src/components/LeadCard.tsx`
- Score badge: `< 50 = red, 50–74 = yellow, 75+ = green`
- Golden Hour badge: flame icon + live countdown timer (updates every 60 seconds)
- Status action buttons: Contacted, Snooze, Dismiss
- Portfolio preview: 2 matched work samples as inline links
- Hover interaction: pre-fetch lead detail on card hover (React Query prefetchQuery)
- Storybook stories for all badge states

---

### L7-T16 — Lead Detail Panel (Slide-over)

- **ID:** L7-T16
- **Phase:** 1
- **Dependencies:** L7-T15, L7-T03
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Slide-over panel opens on card click with full lead data
  2. All 4 outreach draft tabs: Email, LinkedIn, Twitter, Clipboard
  3. Score breakdown shown as visual factor bars
  4. Company health signals shown with tooltip explaining each signal
  5. Panel loads < 500ms (data pre-fetched on card hover)

#### Subtasks:

- Create `packages/web/src/components/LeadDetailPanel.tsx` using Headless UI Dialog
- Score breakdown: horizontal bar chart per factor (6 bars)
- Outreach draft tabs: tabbed interface, draft editable in textarea
- 'Regenerate' button per format
- 'Approve & Schedule' button → triggers send scheduling
- Notes field: free-text, auto-saved on blur
- Status tracker: step indicator (new → viewed → contacted → won/lost)

---

### L7-T17 — Outreach Draft Modal

- **ID:** L7-T17
- **Phase:** 1
- **Dependencies:** L7-T16, L7-T05
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Draft modal pre-loads from notification tap within 2 seconds
  2. Scheduled send time displayed as "Sending on [Day] [Time] [Timezone]"
  3. One-tap approve sends as scheduled; edit opens inline editor
  4. Portfolio matches shown as linked cards above draft

#### Subtasks:

- Create `packages/web/src/components/OutreachDraftModal.tsx`
- Channel selector tabs: Email, LinkedIn, Twitter, Copy
- Display `portfolio_matches` as mini-cards with title + URL
- Schedule display: format send time in user's timezone
- Approve button: `POST /api/outreach/send`
- Edit mode: inline textarea with character count for Twitter/LinkedIn

---

### L7-T18 — Profile Onboarding Wizard UI

- **ID:** L7-T18
- **Phase:** 1
- **Dependencies:** L7-T12, L7-T08
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. 5-step wizard completes in < 10 minutes average (validated by usability test)
  2. Skill input with autocomplete from 500+ skill list
  3. Progress bar shows completeness score (updates live as fields filled)
  4. Wizard skippable but incomplete profile shows persistent upgrade prompt

#### Subtasks:

- Create `packages/web/src/pages/Onboarding.tsx` with 5-step stepper:
  - Step 1: Identity (name, headline, timezone)
  - Step 2: Skills (primary + secondary with autocomplete)
  - Step 3: Rate & Preferences (hourly rate, min budget, tone)
  - Step 4: Portfolio (URL + description + tags, up to 3 in wizard, more in profile)
  - Step 5: Autopilot Setup (min score, budget floor, lead categories)
- Skill autocomplete: client-side fuzzy search against 500-item skills.json
- Profile completeness: computed client-side as `filledFields / totalFields * 100`
- Auto-save on each step transition
- Write Cypress test: complete 5-step wizard, verify profile saved

---

### L7-T19 — Real-Time Feed Updates (WebSocket)

- **ID:** L7-T19
- **Phase:** 2
- **Dependencies:** L7-T14, L7-T10
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. New leads pushed via WebSocket appear at top of feed without manual refresh
  2. Golden Hour badge countdown updates every 60 seconds client-side
  3. Approval Queue updates in real time as new drafts queued
  4. Connection loss indicator shown with reconnect animation

#### Subtasks:

- Install `socket.io-client` in web package
- Create `useWebSocket()` hook with Zustand integration
- On `lead.new` event: prepend to React Query cache (invalidate lead feed)
- On `lead.golden_hour` event: update specific lead in cache
- Golden Hour countdown: `setInterval(60s)` that updates `timeRemaining` state
- Connection loss: show "Reconnecting..." banner; retry with exponential backoff

---

### L7-T20 — Autopilot Control Panel UI

- **ID:** L7-T20
- **Phase:** 3
- **Dependencies:** L7-T12, FR09-T03
- **Estimate:** 8 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Prominent on/off toggle with status indicator (active/paused/vacation)
  2. Ideal Lead Profile editor with all rule fields
  3. Approval Queue: swipeable cards with approve/edit/skip/snooze actions
  4. Schedule calendar showing upcoming scheduled sends

#### Subtasks:

- Create `packages/web/src/pages/Autopilot.tsx`
- Master toggle: animates to green (active) / gray (paused)
- Ideal Lead Profile form: min score slider, budget floor input, source multi-select, category checkboxes
- Approval Queue: virtualized list, swipe gestures (react-spring or Framer Motion)
- Calendar view: react-big-calendar showing scheduled sends
- Pause controls: vacation mode date picker, category/source pause toggles

---

### L7-T21 — Analytics Dashboard UI

- **ID:** L7-T21
- **Phase:** 3
- **Dependencies:** L7-T12, L7-T09
- **Estimate:** 8 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Lead volume chart (last 30 days, by source)
  2. Golden Hour hit rate gauge
  3. Win/Loss pattern report with top 3 actionable insights
  4. Source performance table sortable by leads, score, win_rate

#### Subtasks:

- Create `packages/web/src/pages/Analytics.tsx`
- Install Recharts for charts
- Lead volume: `<AreaChart>` with `<Tooltip>` showing daily breakdown by source
- Golden Hour: `<RadialBarChart>` showing hit rate percentage
- Win/Loss pattern: `<PatternReportCard>` showing 3 bullet insights with color-coded severity
- Source performance: `<DataTable>` with sorting and filtering
