# EPIC: ANALYTICS — Analytics Dashboard

**Phase Scope:** 2 (core metrics), 3 (full dashboard + pattern reports) | **Owner:** Full-stack
**PRD Reference:** Section 10, Non-Functional Requirements; FR-08 debrief integration

---

## Story ANA-S01: Core Telemetry & Tracking (Phase 2)

### ANA-T01 — Lead Volume Telemetry

- **ID:** ANA-T01
- **Phase:** 2
- **Dependencies:** L1-T01, DB-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Every lead ingested tracked with: `{ source, ingested_at, ai_score, golden_hour, boomerang, user_id }`
  2. Queryable by time range: `?period=7d|30d|90d|all`
  3. Lead volume by source: `{ hn_hiring: 42, remoteok: 18, reddit: 31, ... }`
  4. Lead volume by day: time-series data for chart rendering
  5. Average AI score by source

#### Subtasks:

- Verify all required fields exist on `leads` and `lead_scores` tables
- Create `analytics.lead_volume(userId, period)` service function
- Queries: group by `source`, group by `DATE(ingested_at)`, avg by source
- Cache results 15 minutes in Redis: `analytics:{userId}:lead_volume:{period}`
- Return unified `LeadVolumeStats` TypeScript type

---

### ANA-T02 — Source Performance Tracking

- **ID:** ANA-T02
- **Phase:** 2
- **Dependencies:** ANA-T01, FR08-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Per-source metrics: `{ source, lead_count, avg_score, contacted_count, won_count, win_rate }`
  2. Win rate = `(won / contacted) * 100` per source
  3. Average response time by source (lead age at time of contact)
  4. Identifies top-performing source and worst-performing source

#### Subtasks:

- Analytics query: join `leads` + `lead_scores` on `user_id`, group by `source`
- Win rate per source: `COUNT(outcome='won') / NULLIF(COUNT(outcome IN ('won','lost')), 0)`
- Avg response time: `AVG(contacted_at - created_at)` per source
- Return `SourcePerformance[]` sorted by win_rate desc

---

### ANA-T03 — Outreach Activity Tracking

- **ID:** ANA-T03
- **Phase:** 2
- **Dependencies:** L6-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Track every outreach send: `outreach_sends(id, user_id, lead_id, channel, sent_at, scheduled_at, template_version)`
  2. Reply rate: manual tracking (user marks `replied` status on lead)
  3. Channel comparison: reply rate by channel (email vs LinkedIn vs Twitter)
  4. Acceptance rate: drafted → sent percentage

#### Subtasks:

- Create `outreach_sends` table if not exists (or extend existing sends tracking)
- On send action: `INSERT INTO outreach_sends(...)`
- Analytics: `reply_rate = COUNT(status='replied') / COUNT(outreach_sends joined leads)`
- Channel breakdown query
- Cache 15 minutes; endpoint: included in `GET /api/analytics/summary`

---

### ANA-T04 — Golden Hour Hit Rate Metric

- **ID:** ANA-T04
- **Phase:** 2
- **Dependencies:** FR01-T09
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Golden Hour hit rate: `(contacted_within_2h / total_golden_hour_leads) * 100`
  2. Trend: hit rate this period vs. previous period (delta + arrow indicator)
  3. Missed opportunities: leads where `golden_hour=true` but user never contacted
  4. Best Golden Hour source: which source produces the most valuable GH leads

#### Subtasks:

- Query: `lead_scores WHERE golden_hour = true AND user_id = $1`
- `contacted_within_2h`: `contacted_at < created_at + INTERVAL '2 hours'`
- Period comparison: same query for `NOW() - 2*period to NOW() - period`
- Return in analytics summary

---

### ANA-T05 — Win/Loss Analytics Breakdown

_(Implemented as FR08-T06 — see FR08-win-loss-debrief.md)_

- **ID:** ANA-T05
- **Phase:** 2
- **Dependencies:** FR08-T06
- **Estimate:** 1 SP (wrapper only — FR08-T06 provides data)
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/analytics/winloss` returns data from FR08-T06
  2. Included in main analytics summary object
  3. Period filter consistent with other analytics queries

---

### ANA-T06 — Analytics API Endpoints

- **ID:** ANA-T06
- **Phase:** 2
- **Dependencies:** ANA-T01, ANA-T02, ANA-T03, ANA-T04, ANA-T05
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/analytics/summary?period=30d` returns ALL core analytics in single response
  2. `GET /api/analytics/sources` returns source performance table
  3. `GET /api/analytics/winloss?period=30d` returns win/loss breakdown
  4. `GET /api/analytics/leads/timeseries?period=30d&interval=day` returns time-series data
  5. All endpoints protected by auth middleware; only return current user's data
  6. All endpoints cached 15 minutes in Redis

#### Subtasks:

- Create `packages/api/src/routes/analytics.ts`
- Each endpoint delegates to `analyticsService.ts`
- Implement `period` query param: parses `7d|30d|90d|all` to `INTERVAL`
- Rate limit analytics endpoints: 30 requests/minute (expensive queries)
- Full response typed with `AnalyticsSummary` TypeScript interface

---

## Story ANA-S02: Portfolio & Boomerang Analytics (Phase 2)

### ANA-T07 — Portfolio Performance Analytics

_(Implemented as FR03-T07 — see FR03-portfolio-auto-match.md)_

- **ID:** ANA-T07
- **Phase:** 2
- **Dependencies:** FR03-T07
- **Estimate:** 1 SP (aggregate only)

---

### ANA-T08 — Boomerang Conversion Rate

_(Implemented as FR05-T06 — see FR05-boomerang-detector.md)_

- **ID:** ANA-T08
- **Phase:** 2
- **Dependencies:** FR05-T06
- **Estimate:** 1 SP (aggregate only)

---

## Story ANA-S03: Full Analytics Dashboard UI (Phase 3)

### ANA-T09 — Analytics Dashboard UI

- **ID:** ANA-T09
- **Phase:** 3
- **Dependencies:** ANA-T06, FR08-T05, FR03-T07, FR05-T06
- **Estimate:** 8 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `/analytics` page with tabbed sections: Overview | Sources | Win/Loss | Portfolio | Briefing
  2. **Overview tab**: Lead volume chart (Recharts AreaChart), key metric cards, outreach activity
  3. **Sources tab**: Source performance table with win rate bars, sortable columns
  4. **Win/Loss tab**: Stacked bar chart by month; 7-dimension debrief averages radar chart; Pattern Report card
  5. **Portfolio tab**: Portfolio piece performance table: matched leads, sent, replies per piece
  6. All charts responsive; loading skeleton for each section
  7. Period selector: "7 days | 30 days | 90 days | All time" applied globally

#### Subtasks:

- Create `packages/web/src/pages/Analytics.tsx`
- Install `recharts` for charts; `@tanstack/react-table` for sortable tables
- `useAnalytics(period: string)` hook: `GET /api/analytics/summary?period={period}`
- `MetricCard` component: value, label, trend delta (up/down arrow + %)
- `SourceTable` component with sortable columns (react-table)
- `DimensionRadarChart` for Win/Loss debrief dimension averages
- `LeadVolumeChart` — AreaChart of leads/day with source color coding
- Period selector: globally updates all queries via React Query `queryKey`

---

### ANA-T10 — Autopilot Performance Metrics

- **ID:** ANA-T10
- **Phase:** 3
- **Dependencies:** FR09-T02, ANA-T06
- **Estimate:** 3 SP
- **Owner:** Backend / Frontend
- **Acceptance Criteria:**
  1. Autopilot-specific metrics: `{ leads_evaluated, leads_approved, leads_sent, win_rate_from_autopilot }`
  2. Comparison: autopilot leads win rate vs. manually-contacted leads win rate
  3. Autopilot efficiency: time saved estimate ("You saved ~X hours this week")
  4. Shown as a section on the Autopilot Control Panel and in Analytics Overview

#### Subtasks:

- Add `is_autopilot: boolean` to `outreach_sends` table
- Analytics query: `WHERE is_autopilot = true` for autopilot win rate
- Time saved: `leads_approved * 8 minutes` (avg manual outreach time estimate)
- `GET /api/analytics/autopilot-stats` endpoint
- `AutopilotStatsCard` component in both Analytics and Autopilot pages

---

### ANA-T11 — Briefing Performance Tracking

- **ID:** ANA-T11
- **Phase:** 3
- **Dependencies:** FR13-T09, ANA-T09
- **Estimate:** 2 SP
- **Owner:** Backend / Frontend
- **Acceptance Criteria:**
  1. Briefing stats: delivery rate, open rate, action rate per period
  2. Actions taken from briefing: `approved_from_briefing`, `skipped_from_briefing`
  3. Win rate for leads actioned from briefing vs. organic feed
  4. Tab in Analytics Dashboard: included in Overview section

#### Subtasks:

- `GET /api/analytics/briefing-stats` endpoint (FR13-T09 provides data)
- Add `actioned_from_briefing: boolean` to `lead_scores`
- Set flag on action token redemption (FR13-T05)
- Surface in Analytics Overview as "Briefing Performance" card
