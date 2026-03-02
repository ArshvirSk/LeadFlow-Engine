# EPIC: FR-13 — Lead Radar Morning Briefing

**Phase Scope:** 3 (email + in-app), 4 (Slack DM + push) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-13

---

## Story FR13-S01: Briefing Data Assembly (Phase 3)

### FR13-T01 — Briefing Data Aggregation Service

- **ID:** FR13-T01
- **Phase:** 3
- **Dependencies:** L3-T04, FR01-T09, FR05-T06, FR08-T04, FR09-T04, FR07-T03
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `assembleBriefing(userId: string): BriefingData` compiles all sections
  2. Briefing sections:
     - **Header**: Date, "Good morning [first name]", snapshot metrics
     - **Top 5 Leads**: Leads scored ≥ 70 from last 24h, sorted by score desc
     - **Outreach Queue**: Count of pending autopilot items
     - **Golden Hour Summary**: Golden Hour leads surfaced yesterday + hit rate
     - **Win/Loss Update**: Any won/lost leads since last briefing
     - **Alliance Opportunities**: Alliance-eligible leads with skill gaps
     - **Weekly Insight**: Win rate this week vs. last week (Mon–Sun cycles)
  3. Assembly must complete in < 2 seconds
  4. Returns empty-section gracefully (not null) for sections with no data

#### Subtasks:

- Create `packages/workers/src/briefing/briefingAssembler.ts`
- Parallel queries: `Promise.all([getTopLeads(), getQueueCount(), getGoldenHourStats(), getWinLoss(), getAllianceLeads(), getWeeklyStats()])`
- `getTopLeads()`: `SELECT * FROM leads WHERE user_id = $1 AND ai_score >= 70 AND ingested_at > NOW() - INTERVAL '24 hours' ORDER BY ai_score DESC LIMIT 5`
- `getGoldenHourStats()`: from `lead_scores` golden_hour metrics (FR01-T09)
- `getWeeklyStats()`: win_rate this week vs. last (2 queries)
- `BriefingData` TypeScript type exported from `packages/types`

---

### FR13-T02 — Briefing Generation Worker

- **ID:** FR13-T02
- **Phase:** 3
- **Dependencies:** FR13-T01, INFRA-T04
- **Estimate:** 3 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. BullMQ repeatable job: runs every 15 minutes; checks which users are in 6:50am window
  2. For qualifying users: enqueue individual briefing generation job
  3. Individual job: assemble briefing data → render HTML → send via Resend → log delivery
  4. Delivery logged in `briefing_log(id, user_id, generated_at, delivered_at, opened_at)`
  5. No-leads suppression: if all 5 briefing sections are empty → skip send for that day

#### Subtasks:

- `briefing-scheduler.worker.ts`: every 15 minutes, query users whose local time is between 6:45–6:55am
- Per user: check `briefing_log` to avoid duplicate daily send
- `briefing-generate.worker.ts`: consumes `briefing.generation` queue
- On completion: `INSERT INTO briefing_log (..., delivered_at = NOW())`
- Suppression check: `BriefingData` all sections empty → skip, log `suppressed_at`

---

## Story FR13-S02: Email Template & Delivery (Phase 3)

### FR13-T03 — HTML Email Template with Inline Action Buttons

- **ID:** FR13-T03
- **Phase:** 3
- **Dependencies:** FR13-T01, AUTH-T05
- **Estimate:** 5 SP
- **Owner:** Backend / Design
- **Acceptance Criteria:**
  1. Responsive HTML email (600px max-width, works in Gmail/Outlook/Apple Mail)
  2. Each lead in Top 5 has two inline action buttons: "✅ Draft Outreach" and "❌ Skip"
  3. Buttons use HMAC-SHA256 signed tokens (AUTH-T05) — single-use, 48h TTL
  4. Clicking "Draft Outreach" → opens LeadFlow dashboard pre-loaded to that lead's outreach modal
  5. Design: dark header, card-based sections, mobile-responsive

#### Subtasks:

- Create `packages/workers/src/briefing/emailTemplate.tsx` using React Email (`@react-email/components`)
- Token generation for each action button: `generateActionToken(userId, leadId, action)` from AUTH-T05
- Link format: `https://app.leadflow.io/action?token={signed_token}` — server validates and redirects
- Test in Litmus or Email on Acid for client compatibility (Gmail, Outlook, Apple Mail)
- Sections: `BriefingHeader`, `TopLeadsSection`, `QueueSection`, `GoldenHourSection`, `WinLossSection`, `AllianceSection`, `InsightSection`

---

### FR13-T04 — Resend API Integration for Briefing

- **ID:** FR13-T04
- **Phase:** 3
- **Dependencies:** FR13-T03
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Resend API used for briefing email delivery (not transactional SMTP)
  2. From: `"Lead Radar" <briefing@leadflow.io>` with reply-to: `support@leadflow.io`
  3. Subject: `☕ Your Lead Radar — [Day], [Date] (X new leads)`
  4. Delivery confirmation: Resend webhook → update `briefing_log.delivered_at`
  5. Bounce handling: on Resend `email.bounced` webhook → set `user_profiles.briefing_email_bounced = true` → disable briefing

#### Subtasks:

- Configure Resend API key from env: `RESEND_API_KEY`
- `POST https://api.resend.com/emails` with React Email rendered HTML
- Custom domain DNS: configure `briefing@leadflow.io` in Resend
- Resend webhook handler: `POST /api/webhooks/resend` — handle `email.delivered`, `email.bounced`, `email.opened`
- On `email.opened`: update `briefing_log.opened_at = NOW()`

---

## Story FR13-S03: Action Token Handling (Phase 3)

### FR13-T05 — Briefing Action Token Endpoint

- **ID:** FR13-T05
- **Phase:** 3
- **Dependencies:** AUTH-T05, FR13-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/briefing/action?token={signed_token}` validates token + performs action
  2. Token validation: verify HMAC-SHA256 signature; check expiry (48h max); check single-use (Redis consumed set)
  3. Actions supported: `approve_outreach` (→ adds to approval queue), `skip_lead` (→ status=dismissed), `view_lead` (→ redirect to detail)
  4. Invalid/expired token: HTTP 410 (Gone) with user-friendly error page
  5. After action: redirect to `https://app.leadflow.io/leads/{leadId}?action_completed=true`

#### Subtasks:

- `GET /api/briefing/action` route with no auth required (token is the auth)
- Token validation: `verifyActionToken(token)` using AUTH-T05 utility
- Single-use enforcement: `SETNX action_token_used:{tokenHash}` in Redis with 48h TTL
- Redirect on success with action result query param
- Error page: `packages/web/src/pages/TokenExpired.tsx` — friendly "This link has expired" page

---

### FR13-T06 — Briefing Inbox UI

- **ID:** FR13-T06
- **Phase:** 3
- **Dependencies:** FR13-T02, L7-T14
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `/briefing` page shows all past briefings as a list (most recent first)
  2. Each briefing expandable to see full content (same sections as email)
  3. Actions work in-app too: "Draft Outreach" and "Skip" buttons on each lead in Top 5
  4. Briefing marked as "read" automatically when opened in-app
  5. Unread briefing count shown in main navigation badge

#### Subtasks:

- Create `packages/web/src/pages/Briefing.tsx`
- `GET /api/briefing` returns list of past briefings (most recent 30)
- `GET /api/briefing/:id` returns full briefing data for expansion
- `BriefingCard` component: header with date/stats, expandable sections
- Nav badge: `useBriefingUnreadCount()` hook — `GET /api/briefing?unread=true`
- Mark read: on card expand → `PATCH /api/briefing/:id/read`

---

## Story FR13-S04: Notification Channels & Controls (Phase 3/4)

### FR13-T07 — Briefing Timing & Snooze Controls

- **ID:** FR13-T07
- **Phase:** 3
- **Dependencies:** FR13-T02
- **Estimate:** 2 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Default delivery time: 7:00am in user's local timezone
  2. User configurable: delivery time picker (15-minute intervals, 5am–10am range)
  3. Snooze: "Skip tomorrow" and "Pause for 7 days" options in email footer
  4. Snooze stored in `user_profiles.briefing_snooze_until: timestamp | null`
  5. Scheduler respects `briefing_snooze_until` before sending

#### Subtasks:

- Add `briefing_delivery_time` (HH:MM string) and `briefing_snooze_until` to `user_profiles`
- Time picker in Profile Settings: 15-min interval dropdown (5:00am–10:00am)
- Snooze endpoints: `POST /api/briefing/snooze` with `{ duration: '1d' | '7d' }`
- Scheduler: check `briefing_snooze_until > NOW()` → skip send
- "Unsnooze" link in email footer and in `/briefing` page

---

### FR13-T08 — Slack DM Briefing (Pro+ Tier — Phase 4)

- **ID:** FR13-T08
- **Phase:** 4
- **Dependencies:** FR13-T01, FR12-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Pro+ users can receive briefing as Slack DM in addition to / instead of email
  2. Requires user to have connected Slack workspace (FR12-T01)
  3. Slack message format: Block Kit message with sections + action buttons (Approve/Skip)
  4. Slack action buttons post back to `POST /api/webhooks/slack/actions` endpoint

#### Subtasks:

- Add `briefing_channel: 'email' | 'slack' | 'both'` to `user_profiles`
- Briefing generator: if `briefing_channel != 'email'` → build Slack Block Kit message
- Block Kit structure: Header block, Lead Sections with Approve/Skip buttons, Footer
- `POST /api/webhooks/slack/actions` handles button clicks (Slack shortcut)
- Verify `X-Slack-Signature`; process action → same as email action tokens

---

### FR13-T09 — No-Leads Suppression & Delivery Metrics

- **ID:** FR13-T09
- **Phase:** 3
- **Dependencies:** FR13-T02, FR13-T04
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Briefing suppressed when ALL sections have no content (no leads, no queue items, no insights)
  2. Suppression logged: `briefing_log.suppressed = true` — don't count toward open rate
  3. `GET /api/analytics/briefing-stats` returns: delivery rate, open rate, action rate (approve/skip clicks)
  4. Weekly briefing performance in Analytics Dashboard

#### Subtasks:

- `isBriefingEmpty(data: BriefingData): boolean` — checks all section lengths
- Add `suppressed` boolean to `briefing_log` table
- Analytics query: `COUNT(delivered) / COUNT(generated)` for delivery rate
- Open rate: `COUNT(opened_at IS NOT NULL) / COUNT(delivered_at IS NOT NULL)`
- Action rate: `COUNT(actions_taken) / COUNT(opened_at IS NOT NULL)`
