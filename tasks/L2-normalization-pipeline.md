# EPIC: L2 — Normalization Pipeline

**Phase Scope:** 1–2 | **Owner:** Backend / AI
**PRD Reference:** Section 4.1 (L2), Section 6.1 (Universal Lead Schema)

---

## Story L2-S01: Core Normalization Worker

_As the system, I transform every raw lead event from any source into a consistent, validated Lead record._

### L2-T01 — Normalization Pipeline Worker (BullMQ Consumer)

- **ID:** L2-T01
- **Phase:** 1
- **Dependencies:** L1-T02, DB-T01, INFRA-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. BullMQ worker consumes from `raw.leads` queue and publishes to `normalized.leads` queue
  2. Worker is stateless — multiple instances can run in parallel without conflicts
  3. Failed normalization logged with source adapter ID and raw payload for debugging
  4. Throughput: > 100 leads/minute per worker instance

#### Subtasks:

- Create `packages/workers/src/normalization/NormalizationWorker.ts`
- Implement BullMQ Worker consuming `raw.leads` queue with concurrency = 5
- For each job: call `adapter.normalize(rawItem)`, then run all entity extractors
- Assemble final `Lead` object, validate against schema
- Publish valid leads to `normalized.leads` queue
- Publish invalid leads to `normalization.errors` queue (for monitoring)
- Write integration test: enqueue raw HN item, assert normalized lead in output queue

---

### L2-T02 — Lead Schema Validator (Zod)

- **ID:** L2-T02
- **Phase:** 1
- **Dependencies:** L2-T01, DB-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Zod schema validates all 29 Lead fields with correct types
  2. Required fields (`id`, `source`, `title`, `description`, `url`, `created_at`, `ingested_at`) enforced
  3. Optional fields with incorrect type logged as warning but not rejection
  4. Schema is the single source of truth — used by both normalization and API response serialization

#### Subtasks:

- Create `packages/types/src/schemas/lead.schema.ts` with Zod:
  ```typescript
  export const LeadSchema = z.object({
    id: z.string().uuid(),
    source: z.string(),
    title: z.string().min(1),
    description: z.string(),
    url: z.string().url(),
    created_at: z.string().datetime(),
    ingested_at: z.string().datetime(),
    budget: z.number().nullable().optional(),
    budget_type: z
      .enum(["fixed", "hourly", "retainer", "unspecified"])
      .optional(),
    skills_required: z.array(z.string()).optional(),
    // ... all 29 fields
  });
  export type Lead = z.infer<typeof LeadSchema>;
  ```
- Write validation utility: `validateLead(partial: unknown): Result<Lead, ValidationError[]>`
- Export schema and type from `packages/types`
- Write unit tests for each required field failure case

---

## Story L2-S02: NLP Entity Extraction

### L2-T03 — Skills Entity Extractor

- **ID:** L2-T03
- **Phase:** 1
- **Dependencies:** L2-T01
- **Estimate:** 3 SP
- **Owner:** Backend / AI
- **Acceptance Criteria:**
  1. Tech skills extracted from `description` with > 85% precision vs. manually labeled test set
  2. Skill extraction uses curated 500+ tech skill dictionary (exact match + fuzzy)
  3. Extraction runs in < 50ms per lead on average
  4. Extracted skills normalized to canonical form (e.g., "ReactJS" → "React", "node" → "Node.js")

#### Subtasks:

- Build `packages/workers/src/normalization/extractors/skills.extractor.ts`
- Load 500+ tech skills from `packages/workers/src/data/skills.json` (curated list including: React, Vue, Angular, Node.js, Python, Django, FastAPI, TypeScript, PostgreSQL, MySQL, MongoDB, AWS, GCP, Docker, Kubernetes, GraphQL, REST, etc.)
- Implement tokenization: split description into words and n-grams (1, 2, 3 grams)
- Normalize tokens: lowercase, remove punctuation
- Exact match against skills dictionary
- Fuzzy match for common misspellings (Levenshtein distance ≤ 1)
- Normalize canonical forms (alias map: `reactjs → React`, `nodejs → Node.js`, etc.)
- Write test: description with "ReactJS developer needed" → `['React']`

---

### L2-T04 — Budget Entity Extractor

- **ID:** L2-T04
- **Phase:** 1
- **Dependencies:** L2-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Extracts budget amount and type from free-text description with > 80% accuracy
  2. Handles: `$5,000`, `$5k`, `$50/hr`, `$50-100/hour`, `$5,000 fixed`, `$10k-15k retainer`
  3. Budget type correctly classified: `fixed`, `hourly`, `retainer`, `unspecified`
  4. Returns `null` when no budget signal found (not 0)

#### Subtasks:

- Build `packages/workers/src/normalization/extractors/budget.extractor.ts`
- Implement regex patterns:
  - Hourly: `/\$(\d+(?:\.\d+)?)\s*(?:\/\s*(?:hr|hour|h))/i`
  - Range: `/\$(\d+(?:k)?)\s*[-–]\s*\$?(\d+(?:k)?)/i`
  - Fixed: `/\$(\d+(?:,\d{3})*(?:\.\d+)?(?:k)?)/i`
  - Retainer: `/retainer.{0,20}\$(\d+)/i`
- Normalize `k` suffix: `5k → 5000`, `50k → 50000`
- For ranges: use midpoint as `budget` value
- Detect budget_type from context keywords: `fixed`, `hourly`, `per hour`, `retainer`
- Write unit tests for 20+ budget format variations

---

### L2-T05 — Location Entity Extractor

- **ID:** L2-T05
- **Phase:** 1
- **Dependencies:** L2-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Extracts location string from description and source-specific location field
  2. "Remote" variants detected and normalized to "Remote"
  3. Geographic locations preserved as extracted (not geocoded in Phase 1)
  4. Handles: "Remote (US only)", "Anywhere", "NYC or Remote", "Europe timezone"

#### Subtasks:

- Build `packages/workers/src/normalization/extractors/location.extractor.ts`
- Check source-specific location field first (if adapter provides it)
- Apply remote detection regex: `/\bremote\b/i`, `/\banywhere\b/i`, `/\bwfh\b/i`
- Extract geographic mentions using country/city regex list (top 100 cities)
- Return normalized string or null

---

### L2-T06 — Company Name Extractor

- **ID:** L2-T06
- **Phase:** 2
- **Dependencies:** L2-T03
- **Estimate:** 3 SP
- **Owner:** Backend / AI
- **Acceptance Criteria:**
  1. Company/client name extracted from structured source fields first (Upwork, job boards)
  2. NLP extraction from free-text description as fallback
  3. Name normalized: "ACME Inc." → "ACME", "Startup.io" preserved as-is
  4. `client_url` extracted when company name is found alongside URL pattern

#### Subtasks:

- Build `packages/workers/src/normalization/extractors/company.extractor.ts`
- Check adapter-provided `company` field first
- Apply organization NER: regex patterns for common company suffixes (Inc, LLC, Ltd, Co, Corp)
- Extract URLs near company mentions
- Normalize company names

---

### L2-T07 — Claude API NER Integration (Upgrade)

- **ID:** L2-T07
- **Phase:** 2
- **Dependencies:** L2-T03, L2-T04, L2-T05, L2-T06, L3-T02
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Claude API used as higher-quality NER fallback when regex extractors return low confidence
  2. Prompt template extracts: company name, budget, skills, timeline, location in single call
  3. Claude NER only invoked for leads from sources known to have unstructured descriptions
  4. Results cached per lead (never re-invoked for same lead)

#### Subtasks:

- Create `packages/workers/src/normalization/extractors/claude-ner.extractor.ts`
- Design system prompt: structured JSON extraction of {company, budget, skills, timeline, location}
- Invoke Claude only when: regex extractors return < 2 skills AND description length > 200 chars
- Parse Claude JSON response and merge with regex results
- Cache extraction result in lead record (no re-processing)
- Add cost tracking: log Claude API calls per source type

---

### L2-T08 — Embedding Generation for Normalized Leads

- **ID:** L2-T08
- **Phase:** 2
- **Dependencies:** L2-T01, L3-T03
- **Estimate:** 3 SP
- **Owner:** Backend / AI
- **Acceptance Criteria:**
  1. OpenAI `gemini-embedding-001` embedding generated for every normalized lead
  2. Embedding input: concatenation of `title + skills_required.join(', ') + description[:500]`
  3. Embedding stored in `leads.embedding` VECTOR(1536) column
  4. Batched API calls: max 100 embeddings per OpenAI request to minimize latency

#### Subtasks:

- Create `packages/workers/src/normalization/EmbeddingService.ts`
- Implement `generateLeadEmbedding(lead: Partial<Lead>): Promise<number[]>`
- Concatenate text: `${lead.title} ${lead.skills_required?.join(' ')} ${lead.description?.slice(0, 500)}`
- Batch leads in groups of 100, call `openai.embeddings.create({ model: 'gemini-embedding-001', input: batch })`
- Store embedding in lead record before publishing to `normalized.leads` queue
- Track OpenAI embedding API costs in Datadog
- Write unit test: verify embedding is 1536-dimensional float array
