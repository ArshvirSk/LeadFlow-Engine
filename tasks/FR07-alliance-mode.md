# EPIC: FR-07 — Freelancer Alliance Mode

**Phase Scope:** 3 (MVP alliance), 4 (billing + full marketplace) | **Owner:** Full-stack
**PRD Reference:** Section 7, FR-07

> **Decision Required (DEC-05):** 5% success fee on confirmed Alliance deals — billing integration scope, payment processor, and legal structure must be decided before Phase 4 FR07-T09 begins.

---

## Story FR07-S01: Alliance Network Foundation (Phase 3)

### FR07-T01 — Alliance Opt-In & Network Schema

_(Alliance tables in DB-T07 — see DB-database-schema.md)_

- **ID:** FR07-T01
- **Phase:** 3
- **Dependencies:** DB-T07, AUTH-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Users can opt into Alliance Network via `user_profiles.alliance_opt_in = true`
  2. `alliance_members` table stores: `(id, user_id, skills, hourly_rate_range, availability, bio, rating, alliance_count, verified_badge)`
  3. `alliances` table stores: `(id, lead_id, initiator_id, partner_id, status, rate_split, notes, created_at)`
  4. `alliance_ratings` table: `(id, alliance_id, rater_id, ratee_id, score 1-5, comment, created_at)`
  5. Privacy: non-opted-in users NEVER appear in alliance suggestions

#### Subtasks:

- DB migration for `alliance_members`, `alliances`, `alliance_ratings` tables
- `POST /api/alliance/join` → sets `alliance_opt_in = true`, creates `alliance_members` record
- `DELETE /api/alliance/leave` → sets `alliance_opt_in = false`, marks record inactive
- `PUT /api/alliance/profile` → update alliance_members bio, skills, rates, availability
- Validate: `hourly_rate_range` must be `{ min: number, max: number }` both > 0

---

### FR07-T02 — Skill Gap Detection per Lead

- **ID:** FR07-T02
- **Phase:** 3
- **Dependencies:** FR07-T01, L3-T04, DB-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. For each lead, compute set difference: `lead.skills_required - user.core_skills → skill_gaps`
  2. If `skill_gaps` is non-empty AND lead score ≥ 60: mark as potential alliance candidate
  3. `lead.alliance_eligible = true` stored in `lead_scores` join table
  4. Skill gap stored: `lead.skill_gaps = ['UI/UX', 'Mobile']`

#### Subtasks:

- Add skill gap computation to enrichment pipeline (after skill matching step)
- `skillGap = lead.skills_required.filter(s => !userProfile.core_skills.includes(normalizeSkill(s)))`
- If `skillGap.length > 0` → set `alliance_eligible = true` in `lead_scores`
- Store `skill_gaps` array in `lead_scores` JSONB
- Unit test: verify correct gap computation for 10 skill set combinations

---

### FR07-T03 — Alliance Member Suggestion API

- **ID:** FR07-T03
- **Phase:** 3
- **Dependencies:** FR07-T02, DB-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/alliance/suggestions/:leadId` returns top 3 alliance member suggestions
  2. Suggestion ranked by: (a) `skills_match_score` for the skill gaps, (b) `rating`, (c) `alliance_count`
  3. Each suggestion includes: `{ member_id, display_name, avatar, skills, rate_range, rating, alliance_count, verified_badge }`
  4. Never suggest the requesting user themselves
  5. Results cached per user+lead pair for 1 hour

#### Subtasks:

- `GET /api/alliance/suggestions/:leadId` handler
- Fetch lead's `skill_gaps` from `lead_scores`
- Query `alliance_members` WHERE `skills @> ANY(skill_gaps)` AND `user_id != requesting_user_id`
- Rank by: `(matching_skills_count * 3) + (rating * 2) + log(alliance_count + 1)`
- Return top 3; cache in Redis: `alliance:suggestions:{userId}:{leadId}` TTL 3600
- Privacy: only return `display_name` (first name + last initial) and public profile data

---

## Story FR07-S02: Co-Bid Workspace (Phase 3)

### FR07-T04 — Co-Bid Workspace (Shared Lead View + Notes)

- **ID:** FR07-T04
- **Phase:** 3
- **Dependencies:** FR07-T03, L7-T10
- **Estimate:** 8 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Initiator sends Alliance invite from lead card → partner receives push notification
  2. Both users can view the shared lead in co-bid workspace
  3. Shared workspace: lead details, both users' outreach drafts, shared notes (collaborative textarea)
  4. Real-time: both users' cursors/edits visible via Socket.io room
  5. Alliance status: `pending_invite → accepted → active → completed | abandoned`

#### Subtasks:

- Create `POST /api/alliance/invite` → creates `alliances` record with `status: 'pending_invite'`
- Notification to partner: push + in-app WebSocket `alliance:invite` event
- `GET /api/alliance/:allianceId/workspace` returns: lead, both outreach drafts, shared notes
- Socket.io room: `alliance:{allianceId}` — broadcast shared notes changes
- `PATCH /api/alliance/:allianceId/notes` → saves shared notes (debounced 500ms before save)
- `POST /api/alliance/:allianceId/accept` / `reject` → update status
- Alliance workspace page: `/alliance/:allianceId`

---

### FR07-T05 — Rate Split Calculator

- **ID:** FR07-T05
- **Phase:** 3
- **Dependencies:** FR07-T04
- **Estimate:** 3 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Rate split tool in co-bid workspace: total project value + split percentage sliders
  2. Minimum split: 20% for any partner (enforced: slider floor at 20/80)
  3. Shows both: per-hour rate AND total project value for each party
  4. Split agreement saved to `alliances.rate_split: { initiator_pct, partner_pct }` on confirm
  5. Both parties must confirm split before alliance is `active`

#### Subtasks:

- `RateSplitCalculator` component with dual range sliders
- Logic: `partner_pct` slider floor = 20%; when one changes, other auto-adjusts (100 - other)
- Display: "You: $X/hr (Y% of $Z total) | Partner: $A/hr (B%)"
- `POST /api/alliance/:allianceId/split-agreement` → `{ initiator_pct, partner_pct }` → requires both parties confirmed
- Confirmation: two-step confirm button: "Confirm Split" → "Yes, lock it in"

---

## Story FR07-S03: Trust & Reputation (Phase 3)

### FR07-T06 — Community Rating System

- **ID:** FR07-T06
- **Phase:** 3
- **Dependencies:** FR07-T04
- **Estimate:** 5 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. On alliance `completed`: both parties prompted to rate each other (1-5 stars + comment)
  2. Rating only unlocked after alliance status = `completed`
  3. Average rating shown on alliance profile: weighted recency (recent ratings count 2x)
  4. Ratings visible to all alliance members; comment text visible only to ratee

#### Subtasks:

- `POST /api/alliance/:allianceId/rating` → validates alliance is `completed` → saves to `alliance_ratings`
- Compute `weighted_avg_rating` for display: `SUM(score * weight) / SUM(weight)` where `weight = EXTRACT(DAY FROM NOW() - created_at)`
- On rating submit: recompute `alliance_members.rating` for ratee
- Rating UI: star picker + 140-char comment textarea
- Show ratings in Alliance Profile page

---

### FR07-T07 — Verification Badge (3+ Alliances)

- **ID:** FR07-T07
- **Phase:** 3
- **Dependencies:** FR07-T06
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `verified_badge = true` when `alliance_count >= 3` AND `avg_rating >= 4.0`
  2. Recomputed on each alliance completion
  3. Badge shown on alliance profile and in suggestion cards
  4. Badge once earned is NOT removed even if future rating drops (use lifetime count, not current)

#### Subtasks:

- Trigger recomputation after each `alliances.status = 'completed'` update
- `verified = alliance_count >= 3 AND avg_rating >= 4.0`
- Update `alliance_members.verified_badge` in same transaction as alliance completion
- Display: blue checkmark badge in alliance suggestion cards

---

## Story FR07-S04: Alliance UI (Phase 3)

### FR07-T08 — Alliance Network UI

- **ID:** FR07-T08
- **Phase:** 3
- **Dependencies:** FR07-T03, FR07-T04, FR07-T07
- **Estimate:** 8 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `/alliance` page: "My Alliances" tab + "Browse Members" tab
  2. Lead card badge: "Alliance Eligible" on `alliance_eligible=true` leads with "Find Partner" button
  3. Alliance suggestion drawer: shows top 3 partners for specific lead with invite button
  4. "My Alliances" lists all active/pending alliances with workspace link
  5. "Browse Members" shows paginated alliance network with skill filters

#### Subtasks:

- Create `packages/web/src/pages/Alliance.tsx`
- `AllianceSuggestionDrawer` component triggered from lead card
- `AllianceWorkspace` page with shared notes editor
- `AllianceMemberCard` component: avatar, skills chips, rating stars, verified badge
- Tabbed layout: My Alliances | Browse | Requests

---

## Story FR07-S05: Success Fee Billing (Phase 4)

### FR07-T09 — 5% Success Fee Billing Integration

- **ID:** FR07-T09
- **Phase:** 4
- **Dependencies:** FR07-T06, DEC-05
- **Estimate:** 8 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. On `alliances.status = 'completed'` with confirmed project value: charge 5% success fee
  2. Fee split: 2.5% from initiator, 2.5% from partner
  3. Stripe Connect used for payment between parties + platform fee collection
  4. Opt-in acknowledgment at alliance creation: "5% success fee applies to completed alliances"
  5. Fee waived on first alliance for new users (acquisition incentive)

#### Subtasks:

- Integrate Stripe Connect: connected accounts for each alliance member
- `completed` status flow: prompt both parties to confirm final project value
- Stripe charge: split fee across both parties
- Invoice generated: emailed to both parties
- Fee waiver logic: check `user.alliance_count == 1` → skip Stripe charge

> ⚠️ **DECISION DEC-05 REQUIRED before starting FR07-T09:** Legal structure for 5% fee (US + EU), tax implications, Stripe Connect jurisdiction requirements.
