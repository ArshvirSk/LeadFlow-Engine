# EPIC: L3 — AI Scoring Engine

**Phase Scope:** 1–4 | **Owner:** AI / Backend
**PRD Reference:** Section 6 — AI Scoring & Enrichment Engine

---

## Story L3-S01: LLM Provider Abstraction

_As a developer, I can swap between Claude API and OpenAI without touching any business logic._

### L3-T01 — LLMProvider Abstraction Interface

- **ID:** L3-T01
- **Phase:** 1
- **Dependencies:** INFRA-T01
- **Estimate:** 2 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. `LLMProvider` interface defined in `packages/types/src/llm.ts`
  2. All LLM calls in the codebase go through this interface — zero direct SDK calls outside provider implementations
  3. Switching provider requires only changing one environment variable (`LLM_PROVIDER=claude|openai`)
  4. Interface supports: `complete()` (single prompt), `completeBatch()` (multiple prompts), `embed()` (embedding generation)

#### Subtasks:

- Define in `packages/types/src/llm.ts`:
  ```typescript
  export interface LLMProvider {
    complete(prompt: LLMPrompt): Promise<LLMCompletion>;
    completeBatch(prompts: LLMPrompt[]): Promise<LLMCompletion[]>;
    embed(texts: string[]): Promise<number[][]>;
  }
  export interface LLMPrompt {
    system?: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }
  export interface LLMCompletion {
    content: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
  }
  ```
- Create `LLMProviderFactory` that reads `LLM_PROVIDER` env var and instantiates correct provider
- Export from `packages/types`

---

### L3-T02 — Claude API Provider Implementation

- **ID:** L3-T02
- **Phase:** 1
- **Dependencies:** L3-T01
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. `ClaudeProvider` implements `LLMProvider` using `@anthropic-ai/sdk`
  2. Uses `claude-sonnet-4-6` model by default
  3. Automatic retry on 529 (overloaded) with exponential backoff (max 3 retries)
  4. Token usage tracked and logged per call type

#### Subtasks:

- Create `packages/workers/src/llm/ClaudeProvider.ts`
- Install `@anthropic-ai/sdk`
- Implement `complete()` using `client.messages.create()`
- Implement `completeBatch()` as sequential or parallel calls (respect rate limits)
- Implement `embed()` — Claude doesn't natively embed; delegate to OpenAI for embeddings
- Add retry logic: 3 retries, backoff 1s/2s/4s on 529 and 500 errors
- Log `inputTokens`, `outputTokens` per call to Datadog metric `leadflow.llm.tokens`
- Write unit tests with mocked Anthropic SDK responses

---

### L3-T03 — OpenAI Provider Implementation (Embeddings + Fallback)

- **ID:** L3-T03
- **Phase:** 1
- **Dependencies:** L3-T01
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. `OpenAIProvider` implements `LLMProvider` using `openai` SDK
  2. `embed()` uses `gemini-embedding-001` model
  3. `complete()` uses `gpt-4o` as Claude fallback
  4. Embedding batching: max 100 texts per API call

#### Subtasks:

- Create `packages/workers/src/llm/OpenAIProvider.ts`
- Install `openai` SDK
- Implement `embed()` with batching: chunk texts into groups of 100, batch API calls
- Implement `complete()` using `gpt-4o` for fallback scenarios
- Log API costs (tokens × price per token) to Datadog
- Write unit tests with mocked OpenAI SDK responses

---

## Story L3-S02: Enrichment Pipeline

### L3-T04 — 6-Factor Scoring Algorithm

- **ID:** L3-T04
- **Phase:** 1
- **Dependencies:** L3-T02, L3-T03, DB-T01, DB-T04
- **Estimate:** 5 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Composite score (0–100) computed per user based on their profile
  2. All 6 factors implemented with correct default weights: skill_match 30%, budget 20%, client_quality 15%, recency 15%, competition 10%, contact 10%
  3. Score breakdown stored in `lead_scores.score_breakdown` as JSONB
  4. Scoring is idempotent for same lead + user profile combination

#### Subtasks:

- Create `packages/workers/src/scoring/ScoringEngine.ts`
- Implement each scoring factor as a separate function:

  **Factor 1 — Skill Match (30%)**
  - Compute cosine similarity between `lead.embedding` and `user.profile_embedding` using pgvector
  - Query: `SELECT 1 - (leads.embedding <=> $1::vector) AS similarity FROM leads WHERE id = $2`
  - Normalize to 0–100

  **Factor 2 — Budget Clarity & Fit (20%)**
  - If `budget` is null → 30 points (unspecified penalty)
  - If `budget` ≥ user `min_budget` AND `budget` ≤ user `min_budget * 1.2` → 100 points
  - If `budget` < user `min_budget` → linear decay to 0 at 50% below min
  - If `budget` > user `min_budget * 1.2` → 100 points (above target is fine)

  **Factor 3 — Client Quality (15%)**
  - `company_health.status === 'green'` → 100; `'yellow'` → 60; `'red'` → 20
  - Bonus: `trigger_event` present → +10 points
  - Bonus: `client_url` present → +10 points

  **Factor 4 — Posting Recency (15%)**
  - Age < 2h → 100; 2–24h → linear decay 100→60; 24–72h → linear decay 60→20; 72h+ → 20

  **Factor 5 — Competition Level (10%)**
  - `applicant_count` null → 50; < 3 → 100; 3–10 → linear decay; 10+ → 20

  **Factor 6 — Contact Availability (10%)**
  - `contact_info.email` present → 100; `contact_info.linkedin` only → 70; apply-only URL → 40; no contact → 20

- Compute composite: `sum(factor_score * weight)` with weights summing to 1.0
- Store in `lead_scores` table: `(lead_id, user_id, ai_score, score_breakdown, computed_at)`
- Write unit tests for each factor with boundary conditions

---

### L3-T05 — AI Summary Generation (3-Sentence)

- **ID:** L3-T05
- **Phase:** 1
- **Dependencies:** L3-T02, L3-T04
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. 3-sentence summary generated for each lead via Claude API
  2. Sentence 1: what they need; Sentence 2: what they pay; Sentence 3: why it matches this user
  3. Summary cached in `leads.ai_summary` — never regenerated for the same lead+user
  4. Generation completes in < 2 seconds per lead

#### Subtasks:

- Create `SummaryGenerator` in `packages/workers/src/scoring/SummaryGenerator.ts`
- Design system prompt:
  ```
  You are a lead scoring assistant for a freelancer named {user.full_name}.
  Given this job posting, write exactly 3 sentences:
  1. What the client needs (specific, no fluff)
  2. What they're willing to pay (state the budget or 'budget unspecified')
  3. Why this matches {user.full_name}'s skills ({user.primary_skills.join(', ')})
  Keep each sentence under 25 words. Plain English. No markdown.
  ```
- Call `llmProvider.complete({ user: lead.description, system: prompt })`
- Parse response: split by sentence boundaries, validate 3 sentences received
- Store in `lead_scores` (user-specific, since sentence 3 references the user)
- Write unit test: mock LLM response, verify 3 sentences stored

---

### L3-T06 — Deduplication Worker (30-day Window)

- **ID:** L3-T06
- **Phase:** 1
- **Dependencies:** L3-T03, DB-T04
- **Estimate:** 5 SP
- **Owner:** Backend / AI
- **Acceptance Criteria:**
  1. New lead compared against all leads ingested in past 30 days using pgvector cosine similarity
  2. Cosine similarity ≥ 0.92 → exact duplicate: suppress (do not write to DB)
  3. Cosine similarity 0.85–0.92 → near-duplicate: write to DB but set lower score (-15 points)
  4. Dedup check completes in < 200ms for 1M leads (HNSW index required — DB-T04)

#### Subtasks:

- Create `DeduplicationWorker` in `packages/workers/src/scoring/DeduplicationWorker.ts`
- Query: `SELECT id, 1-(embedding <=> $1::vector) AS similarity FROM leads WHERE ingested_at > NOW() - INTERVAL '30 days' ORDER BY similarity DESC LIMIT 5`
- If similarity ≥ 0.92: mark job as duplicate, do not insert lead, log suppression
- If 0.85 ≤ similarity < 0.92: insert lead with `near_duplicate=true` flag, apply -15 score penalty
- Dedup check runs BEFORE scoring — only unique/near-duplicate leads proceed to scoring
- Write integration test: insert lead, insert similar lead, verify second is suppressed

---

### L3-T07 — Boomerang Detection (180-day Window)

- **ID:** L3-T07
- **Phase:** 2
- **Dependencies:** L3-T06, DB-T05
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. New lead compared against user's lead history from past 180 days per user
  2. Similarity ≥ 0.85 → `boomerang=true`, `boomerang_ref` set to original lead ID
  3. Boomerang context stored: original date, source, user's previous action
  4. Boomerang leads score boosted by +5 points (valuable context signal)

#### Subtasks:

- Create `BoomerangDetector` in `packages/workers/src/scoring/BoomerangDetector.ts`
- Per-user query against `lead_history` table (DB-T05)
- On match: set `boomerang=true`, `boomerang_ref=originalLeadId` on lead record
- Store boomerang context in `lead_scores.score_breakdown.boomerang_context`
- Write to `lead_history` for current lead regardless of boomerang status

---

### L3-T08 — Company Health Check (Basic → Full)

- **ID:** L3-T08
- **Phase:** 1 (Crunchbase only), Phase 2 (all 4 signals)
- **Dependencies:** L3-T05
- **Estimate:** 3 SP (Phase 1 portion)
- **Owner:** Backend
- **Acceptance Criteria (Phase 1):**
  1. Crunchbase `last_funding_date` checked for every lead with non-null `client_name`
  2. `last_funding_date` > 24 months → yellow signal
  3. Result cached in Redis for 24 hours per company name
  4. `company_health` field populated before score computation
- _Full 4-signal implementation in FR02-T03 through FR02-T07_

#### Subtasks (Phase 1):

- Create `CompanyHealthService` in `packages/workers/src/scoring/CompanyHealthService.ts`
- Implement Crunchbase API call: search by company name, get last funding date
- Redis cache: `company_health:{normalizedName}` → TTL 24h
- Map result to `{ status: 'green'|'yellow'|'red', signals: string[] }` schema

---

### L3-T09 — Contact Discovery

- **ID:** L3-T09
- **Phase:** 2
- **Dependencies:** L3-T05
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Email pattern inferred from company domain (e.g., `{firstname}@company.com`)
  2. LinkedIn profile URL searched via public API or pattern inference
  3. Twitter handle searched when company/author present
  4. `contact_info` populated with discovered contacts, stored encrypted

#### Subtasks:

- Create `ContactDiscoveryService` in `packages/workers/src/scoring/ContactDiscovery.ts`
- Implement email pattern inference: extract domain from `client_url`, try common patterns (first.last@, firstnamelastname@, etc.)
- Use Hunter.io API (or similar) for email verification (Phase 2+)
- Twitter handle: search `@{companyName}` on Twitter Search API
- Store in `contact_info` JSONB field, encrypt PII before storage

---

### L3-T10 — Portfolio Matching

- **ID:** L3-T10
- **Phase:** 2
- **Dependencies:** DB-T04, DB-T03, L3-T03
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Top 2 portfolio pieces with highest cosine similarity to lead embedding identified per user
  2. Portfolio piece IDs stored in `leads.portfolio_matches` array
  3. Portfolio matching runs after embedding generation, before outreach generation
  4. Query completes in < 100ms (HNSW index on portfolio_pieces.embedding)

#### Subtasks:

- Create `PortfolioMatcher` in `packages/workers/src/scoring/PortfolioMatcher.ts`
- Query: `SELECT id, title, url, 1-(embedding <=> $1::vector) AS similarity FROM portfolio_pieces WHERE user_id=$2 ORDER BY similarity DESC LIMIT 2`
- Store top 2 IDs in `lead_scores` or directly on lead record
- Write test: user with 5 portfolio pieces, verify top 2 most similar returned

---

### L3-T11 — Golden Hour Flag Detection

- **ID:** L3-T11
- **Phase:** 1
- **Dependencies:** L3-T04
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `golden_hour=true` when: age < 2 hours AND applicant_count < 5
  2. When `applicant_count` is null: `golden_hour=true` if age < 1 hour
  3. Flag computed as final step in enrichment pipeline before writing to DB
  4. Flag rechecked on lead re-read (age is time-dependent)

#### Subtasks:

- Create `GoldenHourDetector` function in scoring pipeline
- Compute age: `Date.now() - new Date(lead.created_at).getTime()`
- Apply logic: `age < 2h && (applicant_count < 5 || (applicant_count === null && age < 1h))`
- Set `lead.golden_hour = true/false` before DB write
- Write unit tests for all 4 conditions (with/without applicant_count, age boundaries)

---

### L3-T12 — Outreach Context Generation (Opening Angle)

- **ID:** L3-T12
- **Phase:** 2
- **Dependencies:** L3-T05, L3-T02
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. LLM identifies single best outreach opening angle for each lead + user combination
  2. Angle considers: tech stack match, trigger event, GitHub activity, funding news
  3. Opening angle stored in `lead_scores.score_breakdown.outreach_angle` (user-specific)
  4. Generation batched with AI summary to minimize API calls

#### Subtasks:

- Extend `SummaryGenerator` to produce outreach angle in same LLM call
- Add to summary prompt: "Also output a 1-sentence outreach angle (the single most compelling hook for this specific freelancer)"
- Parse angle from structured JSON response alongside 3-sentence summary
- Store angle in score breakdown

---

### L3-T13 — AI Scoring Weight Personalization

- **ID:** L3-T13
- **Phase:** 4
- **Dependencies:** L3-T04, FR08-T01
- **Estimate:** 8 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. User's win/loss history analyzed to fine-tune scoring weights
  2. Weights updated after every 10 new outcomes (won/lost signals)
  3. Personalized weights stored per user, defaulting to PRD defaults for new users
  4. A/B test framework validates that personalized weights improve win rate

#### Subtasks:

- Design weight optimization algorithm: gradient descent on win/loss outcomes
- Implement `WeightOptimizer` service
- Run re-scoring of recent leads with new weights (not historical backfill)
- A/B test: 50% of Pro users get personalized weights, 50% get defaults
- Measure and report win rate difference in analytics
