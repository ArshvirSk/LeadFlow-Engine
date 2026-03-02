# EPIC: PROFILE — Freelancer Profile & Preference Engine

**Phase Scope:** 1–3 | **Owner:** Full-stack / Backend
**PRD Reference:** Section 10 — Freelancer Profile & Preference Engine

---

## Story PROF-S01: Core Profile Schema & Onboarding

### PROF-T01 — User Profile Schema & Zod Validation

- **ID:** PROF-T01
- **Phase:** 1
- **Dependencies:** DB-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Zod schema validates all profile fields with correct types and constraints
  2. Required fields for onboarding: name, headline, timezone, primary_skills (at least 1)
  3. Schema exported from `packages/types` — shared by API and frontend
  4. TypeScript type inferred from Zod schema (no duplicate interface)

#### Subtasks:

- Create `packages/types/src/schemas/profile.schema.ts`:
  ```typescript
  export const UserProfileSchema = z.object({
    user_id: z.string(),
    full_name: z.string().min(1).max(100),
    headline: z.string().max(120).optional(),
    timezone: z.string(), // IANA timezone string
    hours_per_week: z.number().int().min(1).max(80).optional(),
    earliest_start: z.string().optional(), // ISO date
    primary_skills: z.array(z.string()).min(1).max(5),
    secondary_skills: z.array(z.string()).max(10).optional(),
    hourly_rate: z.number().min(0).optional(),
    min_budget: z.number().min(0).optional(),
    engagement_type: z.enum(["hourly", "fixed", "retainer", "any"]).optional(),
    preferred_industries: z.array(z.string()).optional(),
    blacklisted_categories: z.array(z.string()).optional(),
    remote_only: z.boolean().default(true),
    min_score_threshold: z.number().int().min(0).max(100).default(70),
    tone_preference: z
      .enum(["formal", "casual", "technical", "concise"])
      .default("professional"),
    alliance_opt_in: z.boolean().default(false),
    briefing_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default("07:00"),
    // ... all profile fields
  });
  export type UserProfile = z.infer<typeof UserProfileSchema>;
  ```
- Export type and schema
- Write unit tests for validation edge cases

---

### PROF-T02 — Profile CRUD API

- **ID:** PROF-T02
- **Phase:** 1
- **Dependencies:** PROF-T01, L7-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/profile` returns full profile with portfolio pieces
  2. `PUT /api/profile` accepts partial updates, validates, and saves
  3. Profile created automatically for new users on first authentication
  4. Re-embedding triggered when skills or portfolio change

#### Subtasks:

- Implement profile auto-creation hook: on Clerk `user.created` webhook → insert default profile row
- `GET /api/profile` handler: join `user_profiles` + `portfolio_pieces` + `community_tokens.status`
- `PUT /api/profile` handler: validate with Zod, merge with existing, update DB
- Detect skill changes: compare `primary_skills` before/after update
- If skills changed: enqueue `profile.embed:{userId}` job
- Cache invalidation: delete `profile:{userId}` from Redis on update

---

### PROF-T03 — Skills Autocomplete (500+ Skills)

- **ID:** PROF-T03
- **Phase:** 1
- **Dependencies:** PROF-T02
- **Estimate:** 3 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Skills autocomplete supports 500+ tech skills with fuzzy search
  2. Dropdown appears < 100ms after typing starts
  3. Skills normalized to canonical form on selection (React → React, not ReactJS)
  4. Custom skills can be typed if not in list

#### Subtasks:

- Curate `packages/workers/src/data/skills.json` (500+ entries with canonical names + aliases)
  - Include: all major languages, frameworks, databases, cloud providers, tools
- Expose skills list via `GET /api/meta/skills` endpoint (cached, public)
- Frontend: implement fuzzy-search with `fuse.js` on the skills list
- Show top 5 matches in dropdown as user types
- On selection: normalize to canonical form
- Allow free-text entry for unlisted skills

---

### PROF-T04 — Profile Embedding Generation

- **ID:** PROF-T04
- **Phase:** 2
- **Dependencies:** PROF-T01, L3-T03
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Profile embedding generated from: `primary_skills + secondary_skills + headline + work_history_summary`
  2. Embedding stored in `user_profiles.profile_embedding VECTOR(1536)`
  3. Re-generated when skills or headline change
  4. Initial embedding generated at onboarding completion

#### Subtasks:

- Create `ProfileEmbeddingService` in `packages/workers/src/profile/ProfileEmbedding.ts`
- Concatenate text: `${profile.headline} ${profile.primary_skills.join(' ')} ${profile.secondary_skills?.join(' ')}`
- Call OpenAI `text-embedding-3-small`
- Store in `user_profiles.profile_embedding`
- Worker listens on `profile.embed:{userId}` queue job
- Write test: update skills → verify re-embedding triggered and stored

---

### PROF-T05 — Portfolio Piece CRUD

- **ID:** PROF-T05
- **Phase:** 2
- **Dependencies:** PROF-T01, DB-T03
- **Estimate:** 3 SP
- **Owner:** Backend / Full-stack
- **Acceptance Criteria:**
  1. CRUD for portfolio pieces: `GET/POST/PUT/DELETE /api/profile/portfolio`
  2. Maximum 20 portfolio pieces enforced (returns 422 if exceeded)
  3. Embedding generated on create and on description/tags update
  4. Portfolio pieces UI shows: title, URL preview, skill tags, and match count analytics

#### Subtasks:

- Implement all 4 CRUD endpoints with auth + validation
- Enforce 20-piece limit: `SELECT COUNT(*) FROM portfolio_pieces WHERE user_id=$1`
- On create/update description: enqueue `portfolio.embed:{pieceId}` job
- LinkedIn URL auto-import: accept LinkedIn profile URL, scrape visible portfolio sections (Phase 2+)
- PDF case study upload: accept PDF, extract text with `pdfjs-dist`, use as description
- Write tests for limit enforcement and embedding trigger

---

### PROF-T06 — Portfolio Embedding Generation

- **ID:** PROF-T06
- **Phase:** 2
- **Dependencies:** PROF-T05, L3-T03
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Embedding generated from: `title + description + skill_tags.join(' ') + industry_tags.join(' ')`
  2. Embedding stored in `portfolio_pieces.embedding VECTOR(1536)`
  3. Re-generated on update of description or tags
  4. All portfolio embeddings for a user loaded in < 50ms (indexed)

#### Subtasks:

- Create `PortfolioEmbeddingService`
- Concatenate text from portfolio piece fields
- Call OpenAI embeddings API
- Store in `portfolio_pieces.embedding`
- Worker listens on `portfolio.embed:{pieceId}` queue job

---

### PROF-T07 — Profile Completeness Score

- **ID:** PROF-T07
- **Phase:** 1
- **Dependencies:** PROF-T02
- **Estimate:** 2 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Completeness score shown as percentage progress bar in UI
  2. Score computed client-side based on filled fields
  3. Each section has assigned weight (skills: 25%, portfolio: 25%, rate: 15%, autopilot: 20%, preferences: 15%)
  4. Score correlates with scoring accuracy (shown as "Higher completeness = better lead matching")

#### Subtasks:

- Define completeness formula in `packages/web/src/lib/profileCompleteness.ts`
- Field weights: primary_skills (20%), portfolio_pieces.length (20%), hourly_rate (10%), min_budget (10%), tone_preference (5%), autopilot rules (20%), timezone (5%), briefing_time (10%)
- Progress bar component: `<ProfileCompletenessBar score={score} />`
- Show in sidebar/header with tooltip explaining how to improve
- Write unit tests for completeness formula

---

### PROF-T08 — Autopilot Rules Editor

- **ID:** PROF-T08
- **Phase:** 3
- **Dependencies:** PROF-T02, L4-T02
- **Estimate:** 3 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Ideal Lead Profile editor: min score slider, budget floor, source whitelist, category filter
  2. Rules saved via `PUT /api/profile` body section `autopilot_rules`
  3. Preview shows: "Based on your current rules, X leads from the last 7 days would have qualified"
  4. Rules take effect immediately on save (worker picks up on next poll cycle)

#### Subtasks:

- Add `autopilot_rules` section to Profile Settings page
- Min score threshold slider: 0–100, step 5
- Budget floor: currency input with $ prefix
- Source whitelist: multi-select checkboxes of all active adapters
- Category filter: quick_gig, retainer, full_project, cofounder checkboxes
- Preview query: `SELECT COUNT(*) FROM lead_scores WHERE user_id=$1 AND ai_score >= $2 AND ... AND ingested_at > NOW() - INTERVAL '7 days'`
- Save via `PUT /api/profile` → partial update

---

### PROF-T09 — Community Connections Management

- **ID:** PROF-T09
- **Phase:** 3
- **Dependencies:** AUTH-T06, L5-T10, L5-T12
- **Estimate:** 5 SP
- **Owner:** Full-stack
- **Acceptance Criteria:**
  1. Community Connections section in Profile Settings shows all connected platforms
  2. OAuth connect buttons for Slack and Discord
  3. Per-channel monitoring toggles after connection
  4. Disconnect option revokes token and stops monitoring

#### Subtasks:

- Create `packages/web/src/pages/settings/CommunityConnections.tsx`
- Slack: "Connect Slack" button → OAuth redirect → callback → show workspaces
- Discord: "Add Discord Bot" button → OAuth redirect → callback → show servers
- Per-channel toggles: fetch available channels, toggle monitoring on/off
- Disconnect: `DELETE /api/community/slack/:workspaceId` revokes token
- Show status: "Monitoring X channels across Y workspaces"
