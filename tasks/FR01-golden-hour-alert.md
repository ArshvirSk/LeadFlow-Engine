# EPIC: FR-01 — Golden Hour Alert

**Phase Scope:** 1 (badge only), 2 (full push notifications) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-01

---

## Story FR01-S01: Golden Hour Detection & Feed Badge (Phase 1)

### FR01-T01 — Golden Hour Flag Computation

_(Implemented as L3-T11 in the scoring pipeline — see L3-ai-scoring-engine.md)_

- **ID:** FR01-T01
- **Phase:** 1
- **Dependencies:** L3-T04
- **Estimate:** 2 SP (covered in L3-T11)
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `golden_hour=true` when age < 2h AND applicant_count < 5
  2. When `applicant_count` is null: `golden_hour=true` if age < 1h
  3. Flag recomputed on every lead read (not just at ingestion)
  4. Edge case: HN post with no applicant_count uses 1h threshold

---

### FR01-T02 — Golden Hour Badge on Lead Card (Phase 1)

- **ID:** FR01-T02
- **Phase:** 1
- **Dependencies:** FR01-T01, L7-T15
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Flame icon + countdown timer displayed on `golden_hour=true` leads
  2. Timer shows "Xh Ym left" where X hours and Y minutes remain until 2h threshold
  3. Badge visually distinct — amber/orange background, above score badge in z-order
  4. Badge disappears automatically when countdown reaches 0 (no page refresh needed)

#### Subtasks:

- Add `GoldenHourBadge` component to `LeadCard`
- Compute `timeRemaining` from `lead.created_at` in client-side hook
- `useCountdown(expiresAt: Date)` custom hook using `setInterval(60000)`
- Conditional render: only show when `lead.golden_hour && timeRemaining > 0`
- Add `data-testid="golden-hour-badge"` for testing

---

### FR01-T03 — Golden Hour Countdown Timer Component

- **ID:** FR01-T03
- **Phase:** 1
- **Dependencies:** FR01-T02
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Countdown updates every 60 seconds client-side (no server round-trip)
  2. Format: "1h 23m left" → "45m left" → "Golden Hour Expiring!"
  3. Final 30 minutes: badge pulses (CSS animation) to add urgency
  4. Timer pauses when tab is backgrounded, resumes on visibility (Page Visibility API)

#### Subtasks:

- Create `packages/web/src/components/CountdownTimer.tsx`
- `useCountdown` hook: takes `expiresAt: Date`, returns `{ hours, minutes, seconds, expired }`
- Update timer on `visibilitychange` event to prevent drift
- Pulsing CSS animation when `minutes < 30`
- Write unit test with mocked `Date.now()`

---

## Story FR01-S02: Push Notifications & Pre-loaded Modal (Phase 2)

### FR01-T04 — Push Notification Service

- **ID:** FR01-T04
- **Phase:** 2
- **Dependencies:** L7-T10, INFRA-T05
- **Estimate:** 5 SP
- **Owner:** Backend / Full-stack
- **Acceptance Criteria:**
  1. Push notification fired within 60 seconds of `golden_hour=true` being set
  2. Notification payload: lead title, source, AI score, 1-sentence summary, deep link
  3. Deep link opens pre-loaded outreach draft modal within 2 seconds of tap
  4. Web Push (VAPID) for browser; FCM for mobile (Phase 4)

#### Subtasks:

- Install `web-push` for VAPID-based Web Push Notifications
- Generate VAPID keys; store in environment variables
- Create `PushSubscription` table: `(id, user_id, endpoint, keys, platform, created_at)`
- Frontend: `POST /api/push/subscribe` with subscription object after `PushManager.subscribe()`
- Backend: on `lead.golden_hour` event from scoring pipeline → query user's push subscriptions → send notification
- Notification action button: `view_outreach` → deep link to `/leads/{id}?action=outreach`
- Test: trigger golden_hour flag, verify notification arrives within 60 seconds

---

### FR01-T05 — SMS Notification for Golden Hour

- **ID:** FR01-T05
- **Phase:** 2
- **Dependencies:** FR01-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. SMS sent within 60 seconds for users who opt in to `golden_hour_sms=true`
  2. SMS content: "🔥 Golden Hour: [title] — Score [score]. Tap: [short_url]"
  3. SMS only sent for leads meeting user's min score threshold
  4. Opt-in / opt-out controllable from notification settings

#### Subtasks:

- Integrate Twilio SMS API (or equivalent)
- Add `phone_number` + `phone_verified` to `user_profiles`
- Phone verification flow: send OTP, verify before enabling SMS alerts
- On golden_hour event: check `golden_hour_sms=true` → send Twilio SMS
- Implement short URL generation for the deep link
- Add opt-in controls to notification settings UI

---

### FR01-T06 — User Notification Settings for Golden Hour

- **ID:** FR01-T06
- **Phase:** 2
- **Dependencies:** FR01-T04
- **Estimate:** 2 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. User can set: minimum score threshold for Golden Hour alert (default: 70)
  2. Notification channels configurable: push, SMS, email
  3. Quiet hours: start time + end time (in user timezone)
  4. Settings saved to profile and respected by notification service

#### Subtasks:

- Add notification settings section to Profile Settings UI
- Min score slider for Golden Hour threshold
- Channel toggles: push, SMS (if phone verified), email
- Quiet hours: time range picker with timezone display
- Save to `user_profiles.notification_settings JSONB` field

---

### FR01-T07 — Quiet Hours Enforcement

- **ID:** FR01-T07
- **Phase:** 2
- **Dependencies:** FR01-T06
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Notifications NOT sent during user's configured quiet hours
  2. Golden Hour lead retains `golden_hour` badge in feed during quiet hours
  3. Missed golden hour leads (expired during quiet hours) logged in analytics
  4. Quiet hours respect user's local timezone

#### Subtasks:

- Create `isInQuietHours(user: UserProfile): boolean` utility
- Check `user.quiet_hours_start` and `quiet_hours_end` against current time in user's timezone
- If in quiet hours: skip push/SMS send, log `golden_hour_suppressed` event
- Lead still surfaced in feed with `golden_hour` badge
- Analytics: track `golden_hour_contacted_in_window vs. missed_quiet_hours`

---

### FR01-T08 — Multiple Alert Batching

- **ID:** FR01-T08
- **Phase:** 2
- **Dependencies:** FR01-T04
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. If multiple golden_hour leads detected within 60-second window: batched into single notification
  2. Batch notification: "🔥 3 Golden Hour leads available — tap to review"
  3. No notification spam (max 1 push per 60-second window per user)
  4. Individual alerts resume if only 1 lead per window

#### Subtasks:

- Implement batching: Redis set `golden_hour_batch:{userId}` with 60s TTL
- On golden_hour event: add lead ID to batch set
- Schedule single notification job at TTL expiry
- Notification payload: count > 1 → batch message; count = 1 → individual message

---

### FR01-T09 — Golden Hour Analytics Tracking

- **ID:** FR01-T09
- **Phase:** 2
- **Dependencies:** FR01-T07
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. For every golden_hour lead: track whether user responded within window
  2. `golden_hour_responded_at` vs. `golden_hour_expires_at` stored per lead per user
  3. Hit rate = responded_within_window / total_golden_hour_leads surfaced
  4. Hit rate visible in Analytics Dashboard and weekly briefing

#### Subtasks:

- Add `golden_hour_notified_at`, `golden_hour_responded_at` to `lead_scores`
- On user action (contacted/outreach sent): update `golden_hour_responded_at`
- Analytics query: `hit_rate = COUNT(responded_within_window) / COUNT(golden_hour) * 100`
- Surface in `GET /api/analytics/summary` response
