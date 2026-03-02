# EPIC: FR-05 — Boomerang Lead Detector

**Phase Scope:** 2 (full feature) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-05

---

## Story FR05-S01: Historical Similarity Detection (Phase 2)

### FR05-T01 — 180-Day Lead History Store

_(Schema in DB-T05 — see DB-database-schema.md)_

- **ID:** FR05-T01
- **Phase:** 2
- **Dependencies:** DB-T05, L3-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Every lead with status `contacted`, `won`, or `lost` archived to `lead_history` table
  2. `lead_history` stores: `(id, user_id, lead_id, archived_lead_snapshot JSONB, contacted_at, outcome, similarity_threshold, boomerang_source_lead_id)`
  3. Records kept for 180 days; older records purged by daily cleanup job
  4. History queryable by user_id + embedding range (pgvector index on `lead_embedding`)

#### Subtasks:

- Create `archiveLeadToHistory(userId, leadId)` service
- Called automatically on status change to `contacted`
- Store full lead snapshot as JSONB (for debrief, no joins needed)
- Add `lead_history.lead_embedding VECTOR(1536)` column → index for boomerang lookup
- Daily cleanup job: `DELETE FROM lead_history WHERE archived_at < NOW() - INTERVAL '180 days'`
- Verify: after 180 days, history purged and boomerang no longer detected

---

### FR05-T02 — Boomerang Detection in Enrichment Pipeline

_(Implemented as L3-T07 in the scoring pipeline — see L3-ai-scoring-engine.md)_

- **ID:** FR05-T02
- **Phase:** 2
- **Dependencies:** FR05-T01, L2-T08, DB-T05
- **Estimate:** 3 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. For each newly ingested lead: compare embedding against `lead_history` for same user
  2. Cosine similarity ≥ 0.85 → `lead.boomerang = true`, `lead.boomerang_ref = lead_history.lead_id`
  3. Multiple history matches → use the most recently contacted one
  4. Near-duplicate threshold (< 30 days, similarity ≥ 0.92): suppress as duplicate, not boomerang
  5. Boomerang detection must add < 150ms to enrichment pipeline

#### Subtasks:

- SQL: `SELECT id, 1 - (lead_embedding <=> $1) AS similarity FROM lead_history WHERE user_id = $2 AND archived_at > NOW() - INTERVAL '180 days' ORDER BY lead_embedding <=> $1 LIMIT 1`
- If `similarity >= 0.85 AND archived_at < NOW() - INTERVAL '30 days'` → boomerang
- If `similarity >= 0.92 AND archived_at > NOW() - INTERVAL '30 days'` → near-duplicate (suppress)
- Update `leads.boomerang = true`, `leads.boomerang_ref = lead_history.id`
- Retrieve previous contact context: `outcome`, `contacted_at`, `snapshot.ai_summary`
- Store context in `leads.boomerang_context JSONB`

---

## Story FR05-S02: Feed Surfacing & Outreach (Phase 2)

### FR05-T03 — Boomerang Badge on Lead Card

- **ID:** FR05-T03
- **Phase:** 2
- **Dependencies:** FR05-T02, L7-T15
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Boomerang leads show 🔄 badge with "Boomerang" label
  2. Boomerang leads sorted to the top of their score tier (within same 10-point band, boomerangs first)
  3. Badge tooltip: "You contacted a similar lead [X weeks] ago — [outcome]"
  4. Badge color: teal/cyan to distinguish from Golden Hour amber

#### Subtasks:

- Add `BoomerangBadge` component to `LeadCard`
- Compute `weeksAgo` from `boomerang_context.contacted_at`
- Tooltip: "Seen before — contacted [outcome] [time] ago"
- Sort logic in feed: SQL `ORDER BY (boomerang::int) DESC, ai_score DESC`
- `data-testid="boomerang-badge"` for testing

---

### FR05-T04 — Boomerang Context Modal / Panel Section

- **ID:** FR05-T04
- **Phase:** 2
- **Dependencies:** FR05-T03, L7-T16
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Lead Detail Panel shows "Previous Contact" section for boomerang leads
  2. Section shows: original lead title, contacted date, outcome (won/lost/no reply), AI summary of previous lead
  3. Win/Loss debrief bullet points from previous contact (if available)
  4. "Why this is a Boomerang" explanation: `similarity% match to previous lead`

#### Subtasks:

- Add `BoomerangHistory` section to `LeadDetailPanel`
- Fetch `GET /api/leads/:id/boomerang-history` → returns `boomerang_context` + previous lead snapshot
- Render timeline entry: date → status chip → outcome
- Show AI summary of previous lead for context
- Similarity percentage: `(similarity * 100).toFixed(0) + '% similar'`

---

### FR05-T05 — Boomerang-Specific Outreach Opening Line

_(Implemented as L6-T09 in the outreach generator — see L6-outreach-generator.md)_

- **ID:** FR05-T05
- **Phase:** 2
- **Dependencies:** FR05-T04, L6-T09
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. When `lead.boomerang = true`: opening line references previous interaction
  2. If previous outcome was `lost` → don't mention directly; acknowledge time passed + new angle
  3. If previous outcome was `no reply` → "I reached out about X months ago but wanted to try again…"
  4. Opening line ≤ 25 words; naturally flows into main pitch

#### Subtasks:

- Update `OutreachContextBuilder` to include `boomerang_context` when `lead.boomerang = true`
- Add conditional instruction to LLM system prompt: "This client posted a similar job X months ago. Your opening line should acknowledge this naturally without being awkward. Previous outcome: [outcome]."
- Generate opening line variations by outcome type (won/lost/no_reply)
- Test with 3 outcome scenarios: verify tone appropriateness

---

### FR05-T06 — Boomerang Conversion Rate Analytics

- **ID:** FR05-T06
- **Phase:** 2
- **Dependencies:** FR05-T05, ANA-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Track: boomerang leads contacted vs. cold leads contacted (same score band)
  2. Track: win rate for boomerang vs. cold leads
  3. `GET /api/analytics/boomerang` returns `{ boomerang_contacted, boomerang_won, cold_contacted, cold_won, boomerang_win_rate, cold_win_rate }`
  4. Surface in Analytics Dashboard as "Boomerang vs Cold Outreach" metric card

#### Subtasks:

- Analytics query: join `lead_scores` + `lead_history` on `boomerang = true`
- Aggregate by outcome and boomerang status
- Add metric to Analytics API response
- Surface as comparative metric card: "Boomerang wins at X% vs Cold at Y%"
