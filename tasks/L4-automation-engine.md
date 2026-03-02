# EPIC: L4 — Automation Engine

**Phase Scope:** 1 (scaffold), 3 (full), 4 (Auto-Send) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 4.1 (L4), FR-09 (Autopilot Mode)
**Note:** L4 is scaffolded in Phase 1 as a stub queue consumer. Full Autopilot rule engine is Phase 3 (FR-09).

---

## Story L4-S01: Phase 1 Scaffold — Basic Outreach Queue

_As the system, I can route scored leads into the outreach generation pipeline._

### L4-T01 — Scored Leads Consumer Stub (Phase 1)

- **ID:** L4-T01
- **Phase:** 1
- **Dependencies:** INFRA-T04, L3-T04
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. BullMQ worker consumes from `scored.leads` queue
  2. For Phase 1: routes all scored leads to `outreach.drafts` queue for cold email generation
  3. Worker is stateless and restartable without data loss
  4. Consumed lead IDs logged for pipeline traceability

#### Subtasks:

- Create `packages/workers/src/automation/AutomationWorker.ts`
- Implement simple pass-through: consume `scored.leads`, enqueue to `outreach.drafts`
- Add lead ID + user ID to job payload for outreach generation context
- Write integration test: push scored lead, verify outreach.drafts job created

---

## Story L4-S02: Full Autopilot Rule Engine (Phase 3)

_As a freelancer, I set my ideal lead profile once and wake up to a curated approval queue every morning._

### L4-T02 — Autopilot Rule Evaluator

- **ID:** L4-T02
- **Phase:** 3
- **Dependencies:** L4-T01, PROF-T08, FR09-T01
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Autopilot evaluates every scored lead against each user's Ideal Lead Profile rules
  2. Rules checked: min_score ≥ threshold, budget ≥ floor, source in whitelist, category not blacklisted
  3. Qualifying leads trigger outreach generation for all 4 formats
  4. Non-qualifying leads are still stored in DB but not auto-queued

#### Subtasks:

- Create `AutopilotRuleEngine` class in `packages/workers/src/automation/AutopilotRuleEngine.ts`
- Load user Autopilot rules from `user_profiles` table (cached in Redis, TTL 5 min)
- Evaluate rules in order:
  1. `ai_score >= user.min_score_threshold` (default 70)
  2. `lead.budget >= user.budget_floor` (if budget present)
  3. `lead.source` in `user.source_whitelist` (if whitelist non-empty)
  4. `lead.category` not in `user.lead_category_filter`
- For qualifying leads: publish to `outreach.drafts` with `autopilot=true` flag
- For non-qualifying: update `lead_scores.status = 'pending_review'`, skip drafting
- Write unit tests for each rule condition (pass/fail boundary cases)

---

### L4-T03 — Approval Queue Backend

- **ID:** L4-T03
- **Phase:** 3
- **Dependencies:** L4-T02, DB-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `approval_queue` table stores lead + draft + scheduled send time per user
  2. `GET /api/autopilot/queue` returns paginated list sorted by score desc
  3. Queue supports actions: approve (send now or as scheduled), edit (open draft), skip (dismiss), snooze (delay 24h)
  4. Queue clears processed items within 5 minutes of action

#### Subtasks:

- Write migration: `009_create_approval_queue.sql` with `(id, user_id, lead_id, outreach_draft_id, scheduled_for, status, created_at)`
- Implement `GET /api/autopilot/queue` endpoint: join `approval_queue` with `leads` and `lead_scores`
- Implement `POST /api/autopilot/queue/:id/approve` → move to scheduled send
- Implement `POST /api/autopilot/queue/:id/skip` → mark dismissed
- Implement `POST /api/autopilot/queue/:id/snooze` → delay 24h
- Write unit tests for each queue action

---

### L4-T04 — Send Scheduler (BullMQ Delayed Jobs)

- **ID:** L4-T04
- **Phase:** 3
- **Dependencies:** L4-T03, FR04-T03
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Approved outreach messages scheduled as BullMQ delayed jobs
  2. Scheduled time computed by Send Window Optimizer (FR-04) or user override
  3. Delivery within 5 minutes of scheduled time (per NFR)
  4. Cancellation possible up to scheduled time

#### Subtasks:

- Create `SendSchedulerWorker` in `packages/workers/src/automation/SendScheduler.ts`
- On approval: compute send time via `SendWindowOptimizer.computeOptimalWindow(lead, userTimezone)`
- Create BullMQ delayed job in `scheduled.sends` queue: `{ delay: ms_until_send_time }`
- Implement cancel: `await queue.remove(jobId)` called from `POST /api/outreach/:id/cancel`
- Log send job ID in `approval_queue` for tracking and cancellation
- Write test: verify job executes within ±1 minute of scheduled time

---

### L4-T05 — Vacation & Pause Mode Controls

- **ID:** L4-T05
- **Phase:** 3
- **Dependencies:** L4-T02
- **Estimate:** 3 SP
- **Owner:** Backend / Frontend
- **Acceptance Criteria:**
  1. Vacation mode: pause all Autopilot activity until a specified resume date
  2. Category pause: pause only leads matching a specific category
  3. Source pause: pause only leads from specific sources
  4. All pause states toggle in one tap; resume immediately on user action

#### Subtasks:

- Add pause state fields to `user_profiles`: `autopilot_paused_until DATE`, `paused_categories TEXT[]`, `paused_sources TEXT[]`
- Update `AutopilotRuleEngine` to check pause state before evaluating rules
- Add API endpoints: `POST /api/autopilot/pause` (body: type, until, categories, sources), `POST /api/autopilot/resume`
- Write tests for each pause type

---

### L4-T06 — Daily 7am Digest Email Trigger Scheduler

- **ID:** L4-T06
- **Phase:** 3
- **Dependencies:** L4-T02, FR13-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Briefing generation job scheduled for 6:50am in each user's local timezone
  2. User timezone read from `user_profiles.timezone`
  3. Scheduler runs daily; handles timezone drift (DST transitions)
  4. If user has no qualifying leads, briefing is suppressed and user notified

#### Subtasks:

- Create `BriefingScheduler` cron worker: runs every 10 minutes, checks which users need briefing generated in next 10 minutes
- For each qualifying user: enqueue `briefing.generate:{userId}` job with delay to hit 6:50am local time
- Handle timezone conversion using `date-fns-tz` or `luxon`
- DST handling: recompute scheduled time daily, don't pre-schedule > 24h ahead
- Write test: user in UTC+5, briefing triggers at 6:50am UTC+5

---

### L4-T07 — Auto-Send Mode (95+ Score, Explicit Opt-in)

- **ID:** L4-T07
- **Phase:** 4
- **Dependencies:** L4-T04, AUTH-T02
- **Estimate:** 5 SP
- **Owner:** Backend / Full-stack
- **Acceptance Criteria:**
  1. Auto-Send only enabled after explicit double-confirmation dialog
  2. Only leads scoring ≥ 95 are eligible for auto-send
  3. 60-second undo window after auto-send: job cancellable by user
  4. Full audit log of every auto-sent message accessible in profile settings

#### Subtasks:

- Add `auto_send_enabled BOOLEAN DEFAULT FALSE` to `user_profiles`
- Confirmation flow: UI modal requires typing "ENABLE AUTO-SEND" to confirm
- In `AutopilotRuleEngine`: if `auto_send_enabled && score >= 95` → bypass approval queue, go directly to scheduled send
- Implement 60-second undo: create job with 60s delay, broadcast `lead.auto_queued` webhook, cancel button cancels job
- Create `auto_send_audit_log` table: `(id, user_id, lead_id, draft_content, sent_at, cancelled BOOLEAN)`
- Expose audit log in Profile Settings UI
