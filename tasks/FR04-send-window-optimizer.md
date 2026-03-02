# EPIC: FR-04 — Send Window Optimizer

**Phase Scope:** 2 (full feature) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-04

---

## Story FR04-S01: Timezone Detection & Optimal Window Logic (Phase 2)

### FR04-T01 — Timezone Inference from Lead Data

- **ID:** FR04-T01
- **Phase:** 2
- **Dependencies:** L2-T05, DB-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Infer recipient timezone using priority chain:
     - Priority 1: `lead.location` parsed for city/country → timezone lookup
     - Priority 2: Job posting time pattern (if 3+ posts from same company, analyze hour distribution)
     - Priority 3: Company HQ from Crunchbase API
     - Priority 4: Fallback to `America/New_York` (US East Coast default)
  2. Inferred timezone stored as `lead.recipient_timezone` (IANA format e.g. `America/Chicago`)
  3. Confidence stored: `{ timezone, confidence: 'high' | 'medium' | 'low', source }`
  4. Timezone inference must add < 200ms to enrichment pipeline

#### Subtasks:

- Install `@vvo/tzdb` for city→timezone mappings
- Create `inferTimezone(location: string | null, client_name: string | null): TimezoneResult`
- Location parser: extract city name from strings like "Remote / New York", "Austin, TX", "London, UK"
- Map city to IANA timezone using tzdb city dataset
- Crunchbase HQ lookup (reuse cached `company_health` result for HQ city)
- Store result in `leads.recipient_timezone` JSONB field (add via migration)
- Unit tests: test 10+ common location formats

---

### FR04-T02 — Optimal Send Window Calculator

- **ID:** FR04-T02
- **Phase:** 2
- **Dependencies:** FR04-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Optimal windows (in recipient's timezone):
     - Tuesday–Thursday, 9:00am–10:30am → priority: HIGH
     - Monday, 10:00am–11:30am → priority: MEDIUM
     - Tuesday–Thursday, 2:00pm–3:30pm → priority: MEDIUM
  2. Hard no-send windows: Friday after 2:00pm, Saturday, Sunday
  3. Never schedule within first 30 minutes of recipient's business day (< 9:00am)
  4. Returns next occurrence of nearest optimal window from current time

#### Subtasks:

- Create `calculateOptimalSendWindow(recipientTimezone: string, nowUTC: Date): OptimalWindow`
- `OptimalWindow` type: `{ scheduledAt: Date, windowLabel: string, priority: 'high' | 'medium', dayName: string }`
- Algorithm: iterate forward from `now` (max 7 days) until hitting a valid window
- `date-fns-tz` for timezone-aware date math: `toZonedTime`, `fromZonedTime`
- Unit tests: verify no Friday >2pm windows returned; verify weekend skip; verify Tuesday 9am is HIGH

---

## Story FR04-S02: Scheduling & UI (Phase 2)

### FR04-T03 — BullMQ Delayed Job Scheduler for Send

- **ID:** FR04-T03
- **Phase:** 2
- **Dependencies:** FR04-T02, INFRA-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `POST /api/outreach/send` with `{ leadId, format, schedule: 'optimal' | 'now' | ISO8601 }` accepted
  2. `schedule: 'optimal'` → compute optimal window → enqueue BullMQ job with delay
  3. `schedule: ISO8601` → user-specified future datetime → enqueue with explicit delay
  4. `schedule: 'now'` → immediate enqueue (no delay)
  5. Scheduled jobs cancellable via `DELETE /api/outreach/scheduled/:jobId`
  6. Each scheduled job: `{ userId, leadId, format, outreachDraftId, scheduledAt }`

#### Subtasks:

- Add `scheduled.sends` BullMQ queue (already defined in INFRA-T04)
- Create `scheduleOutreachSend(params)` service function
- Store `scheduled_job_id` in `outreach_sends` table for cancellation lookup
- `DELETE /api/outreach/scheduled/:jobId`: BullMQ `queue.remove(jobId)`
- Job processor: on execution → `sendEmail()` or `copyToClipboard()` + mark lead as `contacted`

---

### FR04-T04 — Send Window UI in Outreach Draft Modal

- **ID:** FR04-T04
- **Phase:** 2
- **Dependencies:** FR04-T03, L7-T17
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Draft modal shows: "Optimal send: Tuesday 9:15am EST" (computed from recipient timezone)
  2. Three send options: "Send Now", "Schedule for [day/time]", "Pick a time"
  3. "Pick a time" opens datetime picker constrained to valid windows only (weekdays 9am–5pm)
  4. Scheduled time displayed in BOTH sender's timezone AND recipient's timezone
  5. Cancel button for already-scheduled sends (shows "Scheduled for [time] — Cancel")

#### Subtasks:

- Add `SendWindowSelector` component to `OutreachDraftModal`
- Call `GET /api/leads/:id/optimal-send-window` to fetch recommended window
- `OptimalSendWindow` API returns: `{ scheduledAt, windowLabel, recipientTimezone, senderTimezone }`
- Datetime picker: use `react-day-picker` with time slot grid (constrained hours)
- Display dual timezone: `"Tuesday 9:15am EST (recipient) / 6:15am PST (you)"`
- If lead already has `scheduled_job_id`: show "Cancel" button

---

### FR04-T05 — No-Send Window Enforcement

- **ID:** FR04-T05
- **Phase:** 2
- **Dependencies:** FR04-T03
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Server-side validation: reject scheduled sends for Friday after 2pm, Saturday, Sunday
  2. HTTP 422 with body: `{ error: "WEEKEND_SEND_BLOCKED", next_valid_window: "Monday 10:00am EST" }`
  3. Retry jobs caught in no-send window (e.g., job delayed by Redis restart) → auto-reschedule to next valid window
  4. Unit test: verify rejection for all blocked windows + acceptance for all valid windows

#### Subtasks:

- Create `isValidSendWindow(date: Date, timezone: string): boolean`
- Validator checks day-of-week and hour in recipient timezone
- Apply validator in `POST /api/outreach/send` handler
- BullMQ job processor: on job start → re-check `isValidSendWindow(now, job.timezone)` → if invalid, delay job by 1 hour and retry
- Write exhaustive unit tests (Friday 1:59pm → OK; Friday 2:00pm → blocked; Sunday noon → blocked)
