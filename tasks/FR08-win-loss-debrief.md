# EPIC: FR-08 — Win / Loss AI Debrief

**Phase Scope:** 2 (full feature) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-08

---

## Story FR08-S01: Debrief Trigger & Generation (Phase 2)

### FR08-T01 — Win/Loss Status Change Trigger

- **ID:** FR08-T01
- **Phase:** 2
- **Dependencies:** L7-T04, DB-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. When lead status changes to `won` or `lost` via `PATCH /api/leads/:id/status`: enqueue debrief job
  2. Debrief BullMQ queue: `debrief.generation` with payload `{ userId, leadId, outcome }`
  3. Job delay: 5-minute delay (allow user to potentially revert status change)
  4. Duplicate debrief prevention: skip if `lead_scores.debrief_generated_at IS NOT NULL`

#### Subtasks:

- Add debrief queue to BullMQ topology: `debrief.generation`
- Modify status PATCH handler: on `won | lost` → `queue.add('debrief', payload, { delay: 300000 })`
- Debrief worker: `debrief-generation.worker.ts`
- Check idempotency: `SELECT debrief_generated_at FROM lead_scores WHERE lead_id = $1 AND user_id = $2`
- Add `debrief_generated_at`, `debrief JSONB` columns to `lead_scores` table (migration)

---

### FR08-T02 — 7-Dimension AI Debrief Generation

- **ID:** FR08-T02
- **Phase:** 2
- **Dependencies:** FR08-T01, L3-T02
- **Estimate:** 5 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. Claude analyzes the lead context and generates debrief across 7 dimensions
  2. 7 dimensions:
     - `rate_alignment` — Budget vs. typical market rate for skills
     - `message_relevance` — How specific the outreach was to their actual need
     - `response_speed` — Time from golden_hour/lead creation to first contact
     - `message_length` — Was outreach too long/short for the channel used?
     - `portfolio_match` — Were portfolio matches highly relevant to their need?
     - `tone` — Formal vs. casual; matched to client profile?
     - `subject_line` — Subject line specificity and open-rate potential
  3. Each dimension: `{ score: 1-5, analysis: string (2 sentences max), recommendation: string (1 sentence) }`
  4. Overall debrief: `{ outcome, dimensions: [...], top_strength, top_improvement, pattern_indicators: string[] }`
  5. Debrief generation must complete in < 10 seconds

#### Subtasks:

- Build debrief prompt: include lead details, user's outreach draft sent, time-to-contact, budget vs. rate
- LLM system prompt with structured JSON output (7-dimension schema)
- Parse Claude response with Zod schema validation
- Retry on malformed JSON response (up to 3 times with different temperature)
- Store debrief in `lead_scores.debrief JSONB`
- Update `lead_scores.debrief_generated_at = NOW()`
- Push WebSocket event `lead:debrief_ready` to user room

---

### FR08-T03 — Lead Debrief Card UI

- **ID:** FR08-T03
- **Phase:** 2
- **Dependencies:** FR08-T02, L7-T16
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Lead Detail Panel shows "Debrief" tab for `won` or `lost` leads
  2. Debrief card: 7 dimension rows with score bar (1-5 stars) + analysis text
  3. Top strength highlighted in green; top improvement highlighted in amber
  4. "What to do next time" summary section at the bottom
  5. Loading skeleton shown while debrief is generating (before WebSocket event received)

#### Subtasks:

- Add `DeBriefTab` to `LeadDetailPanel`
- `DimensionRow` component: dimension name, stars (1-5), analysis, recommendation
- Color coding: score ≥ 4 = green; 3 = neutral; ≤ 2 = amber
- Loading state: 7 skeleton rows while `debrief_generated_at` is null
- On `lead:debrief_ready` WebSocket: invalidate React Query cache for this lead
- "Report a problem with this debrief" link (opens feedback modal)

---

## Story FR08-S02: Pattern Analysis (Phase 2)

### FR08-T04 — Pattern Report Generation (After 10 Losses)

- **ID:** FR08-T04
- **Phase:** 2
- **Dependencies:** FR08-T02
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Pattern report triggered when user reaches 10 cumulative `lost` leads with debriefs
  2. Then triggered for every subsequent 5 losses (10, 15, 20, etc.)
  3. Pattern report: aggregate analysis across all loss debriefs
  4. Identifies top 3 recurring weak dimensions (e.g., "Your subject lines score avg 2.1/5")
  5. Pattern report includes 3 specific, actionable recommendations
  6. Report stored in new `pattern_reports` table

#### Subtasks:

- Add `pattern_reports(id, user_id, generated_at, report JSONB, loss_count_at_generation)` table
- Trigger: on debrief save → `SELECT COUNT(*) FROM lead_scores WHERE user_id = $1 AND outcome = 'lost' AND debrief IS NOT NULL`
- When count reaches trigger threshold: enqueue `pattern.report` job
- Pattern report prompt: include all debrief dimension scores → aggregate → identify trends
- Store in `pattern_reports`; push WebSocket `pattern_report:ready` event
- `GET /api/analytics/pattern-report/latest` endpoint

---

### FR08-T05 — Pattern Report UI in Analytics

- **ID:** FR08-T05
- **Phase:** 2
- **Dependencies:** FR08-T04, ANA-T07
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Analytics Dashboard shows "Outreach Pattern Report" card when ≥1 report exists
  2. Report card: dimension weakness chart (bar chart), top 3 recommendations
  3. Historical reports selectable (track improvement over time)
  4. "Not enough data yet" empty state with progress bar: "8/10 analyzed losses to unlock"

#### Subtasks:

- `PatternReportCard` component in Analytics Dashboard
- `GET /api/analytics/pattern-report/latest` → render latest report
- Historical report selector: dropdown of past reports by date
- Progress indicator: when < 10 losses analyzed, show progress bar
- Recharts bar chart for dimension score averages

---

### FR08-T06 — Win/Loss Analytics Breakdown

- **ID:** FR08-T06
- **Phase:** 2
- **Dependencies:** FR08-T02, ANA-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/analytics/winloss` returns:
     - Total won / lost / no reply breakdown by time period
     - Average dimension scores for wins vs. losses (7 dimensions)
     - Win rate by source (HN, Reddit, etc.)
     - Win rate by score band (90-100, 80-89, etc.)
  2. Queryable by `?period=30d|90d|all`

#### Subtasks:

- Analytics query: `GROUP BY outcome, EXTRACT(WEEK FROM contacted_at)`
- Join `lead_scores.debrief` → aggregate `dimensions[].score` by outcome
- Win rate by source: join `leads.source`
- Win rate by score band: `CASE WHEN ai_score >= 90 THEN '90-100'...`
- Return unified analytics object for dashboard consumption
