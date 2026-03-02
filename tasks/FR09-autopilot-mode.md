# EPIC: FR-09 — Autopilot Mode

**Phase Scope:** 3 (full feature), 4 (Auto-Send 95+) | **Owner:** Full-stack
**PRD Reference:** Section 7, FR-09

> **Note:** The L4 Automation Engine provides the infrastructure backbone for Autopilot. FR-09 is the user-facing configuration layer and UI built on top of L4.

---

## Story FR09-S01: Ideal Lead Profile & Rule Engine (Phase 3)

### FR09-T01 — Ideal Lead Profile Schema & Editor

- **ID:** FR09-T01
- **Phase:** 3
- **Dependencies:** PROF-T01, DB-T02
- **Estimate:** 3 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. `user_profiles.autopilot_rules JSONB` stores the Ideal Lead Profile configuration
  2. Rules schema: `{ min_score, required_skills[], preferred_sources[], min_budget, max_budget, category_filter[], exclude_red_companies, require_contact_info }`
  3. Preview query: rules editor shows "X leads in last 30 days would have matched"
  4. Rules validated on save: min_score must be 50-100; budgets must be positive
  5. Changes take effect on next lead ingestion (not retroactive)

#### Subtasks:

- Extend `UserProfile` Zod schema with `autopilot_rules` field
- `PUT /api/profile/autopilot-rules` endpoint
- Preview endpoint: `POST /api/profile/autopilot-rules/preview` → runs rules against last 30 days of leads → returns count
- `AutopilotRulesEditor` React component with live preview
- Rules validation: `z.object({ min_score: z.number().min(50).max(100), ... })`

---

### FR09-T02 — Autopilot Rule Evaluator Worker

_(Implemented as L4-T02 — see L4-automation-engine.md)_

- **ID:** FR09-T02
- **Phase:** 3
- **Dependencies:** FR09-T01, L4-T02, INFRA-T04
- **Estimate:** 5 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. After lead scoring: `scored.leads` queue consumed by Autopilot Evaluator
  2. For each user with `autopilot_enabled = true`: evaluate lead against their Autopilot rules
  3. Lead passes all rules → enqueue to `outreach.drafts` queue for automatic draft generation
  4. Lead fails rules → no action (lead still visible in feed)
  5. Worker must process 1000 leads/minute across all active Autopilot users

#### Subtasks:

- Fetch all users with `autopilot_enabled = true` (cache in Redis, 5-min TTL)
- `evaluateAutopilotRules(lead: Lead, rules: AutopilotRules): boolean`
- For matching leads: add to `approval_queue` table with `status: 'pending'`
- Bulk enqueue: process each qualifying user in parallel (Promise.all)
- Log evaluation stats: `autopilot.leads_evaluated`, `autopilot.leads_approved` per user

---

### FR09-T03 — Auto-Generated Outreach Drafts

- **ID:** FR09-T03
- **Phase:** 3
- **Dependencies:** FR09-T02, L6-T07
- **Estimate:** 3 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. `outreach.drafts` worker generates all 4 outreach formats for autopilot leads
  2. Drafts stored in `approval_queue.drafts JSONB`
  3. Generation must complete within 3 seconds per lead
  4. User notified via push/WebSocket when new item in approval queue

#### Subtasks:

- `outreach-drafts.worker.ts` consuming `outreach.drafts` queue
- Calls `OutreachGenerator.generateAll(lead, userProfile)` (L6-T07)
- Stores 4 drafts in `approval_queue` record
- Push notification: "New lead ready for review — [title]" with deep link to approval queue
- WebSocket: `approval_queue:new_item` event to user room

---

## Story FR09-S02: Approval Queue UI (Phase 3)

### FR09-T04 — Approval Queue Backend

_(Implemented as L4-T03 — see L4-automation-engine.md)_

- **ID:** FR09-T04
- **Phase:** 3
- **Dependencies:** FR09-T03, DB-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/approval-queue` returns pending items for authenticated user (newest first)
  2. `POST /api/approval-queue/:itemId/approve` → immediately send/schedule outreach
  3. `POST /api/approval-queue/:itemId/skip` → mark as `status: 'skipped'`
  4. `POST /api/approval-queue/:itemId/edit` → update draft before sending
  5. Items expire after 48 hours (stale leads removed from queue automatically)

#### Subtasks:

- Create `approval_queue(id, user_id, lead_id, drafts JSONB, status, created_at, expires_at)` table
- `GET /api/approval-queue` with pagination (cursor-based, 20 per page)
- `POST /:id/approve` → validate not expired → invoke send scheduler (FR04-T03)
- `POST /:id/skip` → `status = 'skipped'` → item stays for analytics
- Expiry: BullMQ job at item creation → delay 48h → mark `expired` items

---

### FR09-T05 — Approval Queue Swipeable Cards UI

- **ID:** FR09-T05
- **Phase:** 3
- **Dependencies:** FR09-T04, FR09-T03
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `/approval-queue` page: card-based interface (not a table)
  2. Swipe right / keyboard `→` = Approve; Swipe left / keyboard `←` = Skip
  3. Card shows: lead title, company, score, AI summary, outreach preview (email by default)
  4. "Edit before sending" option: inline editor with live char count per channel
  5. Queue badge in main nav: shows count of pending items

#### Subtasks:

- Create `packages/web/src/pages/ApprovalQueue.tsx`
- `ApprovalCard` component: full card UI with swipe gesture (react-swipeable)
- Keyboard shortcuts: `→` approve, `←` skip, `E` edit
- Channel tabs on card: Email | LinkedIn | Twitter | Clipboard
- Expiry countdown on each card: "Expires in X hours"
- Navigation badge: `useApprovalQueueCount()` hook polling every 60 seconds

---

## Story FR09-S03: Pause Controls & Auto-Send (Phase 3/4)

### FR09-T06 — Pause Mode Controls

_(Implemented as L4-T05 — see L4-automation-engine.md)_

- **ID:** FR09-T06
- **Phase:** 3
- **Dependencies:** FR09-T01
- **Estimate:** 3 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Vacation mode: set start date + end date → no autopilot items generated during period
  2. Category pause: pause specific lead categories (quick_gig, full_project, etc.)
  3. Source pause: pause specific sources (e.g., pause Upwork)
  4. All pause states stored in `user_profiles.autopilot_pause_config JSONB`
  5. Banner in Autopilot UI when any pause is active: "Autopilot paused until [date]"

#### Subtasks:

- Add `autopilot_pause_config` to UserProfile schema
- `PUT /api/profile/pause-config` endpoint
- Evaluator: check pause config before enqueuing drafts
- UI: pause controls section in Autopilot Control Panel
- Vacation mode: date range picker with timezone display

---

### FR09-T07 — Autopilot Control Panel UI

- **ID:** FR09-T07
- **Phase:** 3
- **Dependencies:** FR09-T01, FR09-T06
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `/autopilot` page: master on/off toggle + all configuration sections
  2. Stats row: "Reviewed today: X | Approved this week: Y | Win rate from autopilot: Z%"
  3. Ideal Lead Profile editor with live preview count
  4. Outreach timing section (links to FR-04 send window config)
  5. Pause Controls section (vacation mode, category/source pauses)
  6. "Audit Log" tab: last 100 items evaluated — what passed/failed rules and why

#### Subtasks:

- Create `packages/web/src/pages/Autopilot.tsx`
- Master toggle with confirmation dialog ("Enabling Autopilot will automatically draft outreach")
- Stats from `GET /api/analytics/autopilot-stats`
- Live preview: debounced `POST /api/profile/autopilot-rules/preview` on rule change
- Audit Log: `GET /api/autopilot/audit-log` → show last 100 evaluations with pass/fail reason

---

### FR09-T08 — Auto-Send Mode (Score ≥ 95 with Undo)

_(Implemented as L4-T07 — see L4-automation-engine.md)_

- **ID:** FR09-T08
- **Phase:** 4
- **Dependencies:** FR09-T02, FR04-T03
- **Estimate:** 5 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Auto-Send mode is opt-in WITHIN Autopilot; requires 2-click confirmation
  2. Only leads scoring ≥ 95 are eligible for Auto-Send
  3. 60-second undo window after send is triggered (before actual API call fires)
  4. Undo mechanism: BullMQ delayed job + WebSocket countdown toast
  5. After 60 seconds with no undo: send executes; lead marked `contacted`

#### Subtasks:

- `auto_send_enabled` boolean on `user_profiles` (separate from `autopilot_enabled`)
- On ≥95 score lead passing autopilot rules: enqueue `scheduled.sends` with 60s delay
- Push WebSocket event `auto_send:scheduled` → frontend shows countdown toast
- Toast: "Auto-sending to [company] in 60s — [Undo]" with countdown
- `POST /api/outreach/undo/:jobId` → BullMQ `queue.remove(jobId)` within 60s window
- Confirmation dialog on enabling: "Sends will execute automatically. You'll have 60 seconds to undo."

---

### FR09-T09 — Daily 7am Digest Email Trigger

_(Implemented as L4-T06 — see L4-automation-engine.md)_

- **ID:** FR09-T09
- **Phase:** 3
- **Dependencies:** FR09-T04, FR13-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Daily 7am (in user's local timezone) scheduler sends digest with pending approval queue items
  2. Digest summarizes: "X leads waiting in your queue — top scored: [title]"
  3. Links directly to `/approval-queue` with auth token
  4. Suppressed if queue is empty (no idle digest sends)

#### Subtasks:

- BullMQ repeatable job: runs every 15 minutes to check which users' local time ≈ 7am
- For users in 7am window: check if approval queue is non-empty → send email if not
- Use Resend API for delivery
- Mark `digest_sent_at` to avoid duplicate sends within same day
