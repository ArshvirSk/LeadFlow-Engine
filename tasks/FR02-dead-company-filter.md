# EPIC: FR-02 — Dead Company Filter

**Phase Scope:** 1 (Crunchbase signal only), 2 (4-signal composite), 3 (live stream alerts) | **Owner:** Backend
**PRD Reference:** Section 7, FR-02

---

## Story FR02-S01: Crunchbase-Only Health Check (Phase 1)

### FR02-T01 — Company Health Step — Crunchbase Signal

_(Implemented as L3-T08 in the enrichment pipeline — see L3-ai-scoring-engine.md)_

- **ID:** FR02-T01
- **Phase:** 1
- **Dependencies:** L3-T04, DB-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. For every lead with non-null `client_name`: query Crunchbase `/v4/entities/organizations` by name
  2. `last_funding_date` > 12 months ago → `company_health.status = "yellow"`
  3. Company not found OR `last_funding_date` > 24 months ago → `status = "red"`
  4. Recently funded (≤ 12 months) → `status = "green"`
  5. `company_health.signals` includes reason string: e.g., `["Last funded 18 months ago"]`
  6. Results cached 24h in Redis: `company_health:{normalizedName}`

#### Subtasks:

- Create `packages/workers/src/enrichment/companyHealth.ts`
- Implement `CrunchbaseClient`: GET request with API key header, map to `CompanyHealth` type
- Cache key: `company_health:${slugify(client_name)}`; TTL 86400 seconds
- Handle Crunchbase 404 → status = "red", signal = "Company not found"
- Handle Crunchbase 429 → use cached value if available, else skip enrichment
- Upsert `company_health` on `leads` record after computation
- Unit test: mock Crunchbase response, assert correct status + signal

---

### FR02-T02 — Company Health Badge on Lead Card (Phase 1)

- **ID:** FR02-T02
- **Phase:** 1
- **Dependencies:** FR02-T01, L7-T15
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Green dot for "green", yellow dot for "yellow", red skull/X for "red"
  2. Tooltip on hover shows `company_health.signals` array as bullet list
  3. Badge shown only when `client_name` is non-null
  4. No badge displayed when company health data is unavailable / still loading

#### Subtasks:

- Add `CompanyHealthBadge` component in `LeadCard`
- Props: `status: 'green' | 'yellow' | 'red' | null`, `signals: string[]`
- Tooltip using Radix UI `<Tooltip>` — renders signals as `<ul>`
- Colors: green = `bg-green-100 text-green-700`; yellow = `bg-amber-100 text-amber-700`; red = `bg-red-100 text-red-700`
- `data-testid="company-health-badge"` for testing

---

## Story FR02-S02: Multi-Signal Health Composite (Phase 2)

### FR02-T03 — Company Health — Layoffs.fyi RSS Signal

- **ID:** FR02-T03
- **Phase:** 2
- **Dependencies:** FR02-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Parse Layoffs.fyi RSS feed on 6h schedule for new layoff announcements
  2. Match company names using fuzzy match (Levenshtein ≤ 2) against monitored leads
  3. Layoff detected in past 90 days → `company_health.status = "red"`, signal = `"Recent layoffs detected"`
  4. Feed items normalized: `{ company, date, percentage, source: 'layoffs.fyi' }`

#### Subtasks:

- Create `LayoffsFyiAdapter` implementing `SourceAdapter` for health data (not leads)
- Parse RSS feed: `https://layoffs.fyi/feed/`
- Store layoff events in new table: `company_health_events(company_name, event_type, event_date, source, data)`
- Lookup during company health check: `SELECT * FROM company_health_events WHERE company_name ILIKE $1 AND event_date > NOW() - INTERVAL '90 days'`
- On match: update lead's `company_health` asynchronously (don't block enrichment)

---

### FR02-T04 — Company Health — Glassdoor Rating Delta Signal

- **ID:** FR02-T04
- **Phase:** 2
- **Dependencies:** FR02-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Glassdoor rating fetched via unofficial API or SerpAPI for company name
  2. Rating < 3.0 → adds `"Low Glassdoor rating (X.X)"` to signals; if only signal → "yellow"
  3. Rating ≥ 3.5 → neutral; rating ≥ 4.0 → positive signal for green
  4. Graceful degradation: skip if API unavailable; never lower status below red

#### Subtasks:

- Integrate SerpAPI or Bright Data for Glassdoor rating lookup
- Map rating ranges to signal strings
- Combine with Crunchbase + Layoffs signals in multi-signal health resolver
- Cache Glassdoor result 7 days per company (stale data ok)

---

### FR02-T05 — Company Health — LinkedIn Headcount Delta Signal

- **ID:** FR02-T05
- **Phase:** 2
- **Dependencies:** FR02-T01
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Attempt LinkedIn company headcount via public API or LinkedIn Data API
  2. Headcount declined > 20% MoM → `"Headcount shrinking"` signal
  3. Headcount growing → positive signal for green status
  4. NOTE: LinkedIn data access is HIGH RISK — see External Dependencies in overview

#### Subtasks:

- Evaluate LinkedIn Data API availability (RapidHub LinkedIn API vs. official API)
- If available: store baseline headcount in `company_health_events`
- Compare to previous value: delta > -20% adds negative signal
- Fail gracefully if LinkedIn returns 429 or access denied — skip this signal
- Log integration health via Datadog custom metric `company_health.linkedin_success_rate`

---

### FR02-T06 — Multi-Signal Health Status Computation

- **ID:** FR02-T06
- **Phase:** 2
- **Dependencies:** FR02-T03, FR02-T04, FR02-T05
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Red signals take priority: any red signal → overall status = "red"
  2. 2+ yellow signals → status = "red"
  3. 1 yellow, 0 red → status = "yellow"
  4. All positive or no signals → status = "green"
  5. All signals listed in `company_health.signals` array

#### Subtasks:

- Create `resolveCompanyHealthStatus(signals: HealthSignal[]): CompanyHealth` function
- Signal priority: `red > yellow > green`
- Write unit tests covering all 5 combinations above
- Ensure computation is deterministic for same inputs

---

### FR02-T07 — Company Health 24h Cache

- **ID:** FR02-T07
- **Phase:** 1
- **Dependencies:** FR02-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Redis cache key: `company_health:{slug(company_name)}`; TTL: 86400 seconds
  2. Cache stores full `CompanyHealth` object as JSON string
  3. Cache miss → run all available health signals, store result
  4. Cache HIT rate > 85% in production (most leads reference same companies)

#### Subtasks:

- Wrap `fetchCompanyHealth()` with Redis get/set
- Key normalization: lowercase, remove spaces → `acme-corp`
- Cache invalidation: when layoff event detected → delete cache key for that company
- Log cache hit/miss ratio to Datadog: `company_health.cache_hit_rate`

---

### FR02-T08 — Hide Distressed Companies Toggle

- **ID:** FR02-T08
- **Phase:** 2
- **Dependencies:** FR02-T02, L7-T05
- **Estimate:** 2 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Filter bar toggle: "Hide Red Companies" (off by default)
  2. When enabled: leads with `company_health.status = 'red'` excluded from feed
  3. Toggle persists in user preferences (`filter_hide_red_companies: boolean`)
  4. Count of hidden leads shown: "12 distressed companies hidden"

#### Subtasks:

- Add `hideRedCompanies` filter to `GET /api/leads` query params
  - SQL: `AND (company_health->>'status' != 'red' OR company_health IS NULL)`
- Save preference to `user_profiles.preferences JSONB`
- UI toggle in filter bar with count badge
- "View anyway" button on individual red leads in detail panel
