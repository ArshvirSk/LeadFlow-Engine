# EPIC: DB — Database Schema & Migrations

**Phase Scope:** 1–4 | **Owner:** Backend / Full-stack
**⚠️ DECISION REQUIRED — DEC-01:** Per-user scoring requires `lead_scores` join table (recommended) vs. per-user lead rows. Finalize before DB-T01.

---

## Story DB-S01: Core Schema (Phase 1)

_As the system, I can persist all normalized lead data with user-scoped scores and full profile data._

### DB-T01 — Universal Lead Schema Migration

- **ID:** DB-T01
- **Phase:** 1
- **Dependencies:** INFRA-T02, DEC-01 resolved
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `leads` table created with all 29 schema fields correctly typed
  2. `lead_scores` join table created: `(lead_id, user_id, ai_score, score_breakdown JSONB, computed_at)`
  3. Indexes on `created_at`, `source`, `user_id` for common query patterns
  4. Migration is idempotent and reversible (up + down scripts)

#### Subtasks:

- Choose migration tool: `node-postgres-migrate` or `db-migrate` or raw SQL files in `packages/api/migrations/`
- Write `001_create_leads_table.sql`:
  ```sql
  CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    budget NUMERIC,
    budget_type VARCHAR(16),
    skills_required TEXT[],
    client_name TEXT,
    client_url TEXT,
    contact_info JSONB,
    location TEXT,
    applicant_count INTEGER,
    ai_summary TEXT,
    category VARCHAR(32),
    company_health JSONB,
    trigger_event VARCHAR(64),
    golden_hour BOOLEAN DEFAULT FALSE,
    boomerang BOOLEAN DEFAULT FALSE,
    boomerang_ref UUID REFERENCES leads(id),
    portfolio_matches UUID[],
    matched_skills TEXT[],
    outreach_drafts JSONB,
    status VARCHAR(16) DEFAULT 'new',
    user_notes TEXT,
    embedding VECTOR(1536)
  );
  ```
- Write `002_create_lead_scores_table.sql`:
  ```sql
  CREATE TABLE lead_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    ai_score NUMERIC(5,2) NOT NULL,
    score_breakdown JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lead_id, user_id)
  );
  ```
- Add indexes: `CREATE INDEX leads_created_at_idx ON leads(created_at DESC)`, `CREATE INDEX leads_source_idx ON leads(source)`, `CREATE INDEX lead_scores_user_id_idx ON lead_scores(user_id)`
- Write down migrations for both tables
- Add migration runner to Railway deploy pipeline (auto-run on startup)

---

### DB-T02 — User Profiles Table

- **ID:** DB-T02
- **Phase:** 1
- **Dependencies:** DB-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `user_profiles` table stores all Profile Engine fields with correct types
  2. `user_id` (Clerk user ID) is the primary key
  3. `skills` and `secondary_skills` stored as `TEXT[]` with skill embedding vector
  4. Profile reads return in < 50ms

#### Subtasks:

- Write `003_create_user_profiles_table.sql`:
  ```sql
  CREATE TABLE user_profiles (
    user_id TEXT PRIMARY KEY,
    full_name TEXT,
    headline TEXT,
    timezone TEXT,
    hours_per_week INTEGER,
    earliest_start DATE,
    primary_skills TEXT[],
    secondary_skills TEXT[],
    hourly_rate NUMERIC,
    min_budget NUMERIC,
    engagement_type VARCHAR(16),
    preferred_industries TEXT[],
    blacklisted_categories TEXT[],
    remote_only BOOLEAN DEFAULT TRUE,
    preferred_project_length TEXT,
    min_score_threshold INTEGER DEFAULT 70,
    source_whitelist TEXT[],
    budget_floor NUMERIC,
    lead_category_filter TEXT[],
    auto_send_enabled BOOLEAN DEFAULT FALSE,
    tone_preference VARCHAR(16) DEFAULT 'professional',
    alliance_opt_in BOOLEAN DEFAULT FALSE,
    alliance_skills TEXT[],
    alliance_available BOOLEAN DEFAULT FALSE,
    briefing_time TIME DEFAULT '07:00',
    min_push_score INTEGER DEFAULT 80,
    golden_hour_sms BOOLEAN DEFAULT FALSE,
    digest_frequency VARCHAR(16) DEFAULT 'daily',
    profile_embedding VECTOR(1536),
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- Add `updated_at` trigger function
- Write down migration

---

## Story DB-S02: Enrichment & Feature Tables (Phase 2)

### DB-T03 — Portfolio Pieces Table

- **ID:** DB-T03
- **Phase:** 2
- **Dependencies:** DB-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `portfolio_pieces` table created with embedding vector column
  2. User can store up to 20 portfolio pieces (enforced at API level)
  3. Embedding generated on insert and on update of `description` or `skill_tags`
  4. Cascade delete on user profile deletion

#### Subtasks:

- Write `004_create_portfolio_pieces_table.sql`:
  ```sql
  CREATE TABLE portfolio_pieces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT NOT NULL,
    skill_tags TEXT[],
    industry_tags TEXT[],
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX portfolio_pieces_user_id_idx ON portfolio_pieces(user_id);
  ```
- Write down migration

---

### DB-T04 — pgvector HNSW Index on Lead Embeddings

- **ID:** DB-T04
- **Phase:** 2
- **Dependencies:** DB-T01, DB-T03
- **Estimate:** 3 SP
- **Owner:** Backend / DevOps
- **Acceptance Criteria:**
  1. HNSW index created on `leads.embedding` with `ef_construction=200, m=16`
  2. HNSW index created on `portfolio_pieces.embedding`
  3. Cosine similarity query on 1M leads completes in < 50ms
  4. Index creation does not block production reads (use `CREATE INDEX CONCURRENTLY`)

#### Subtasks:

- Write `005_create_vector_indexes.sql`:

  ```sql
  CREATE INDEX CONCURRENTLY leads_embedding_hnsw_idx
    ON leads USING hnsw (embedding vector_cosine_ops)
    WITH (ef_construction = 200, m = 16);

  CREATE INDEX CONCURRENTLY portfolio_embedding_hnsw_idx
    ON portfolio_pieces USING hnsw (embedding vector_cosine_ops)
    WITH (ef_construction = 200, m = 16);

  CREATE INDEX CONCURRENTLY lead_scores_embedding_hnsw_idx
    ON lead_scores USING hnsw (embedding vector_cosine_ops)
    WITH (ef_construction = 200, m = 16);
  ```

- Benchmark similarity search against 100k, 500k, 1M rows
- Configure `pgvector.hnsw.ef_search = 64` for query-time parameter
- Write performance test asserting < 50ms at 1M rows

---

### DB-T05 — Lead History Table for Boomerang Detection

- **ID:** DB-T05
- **Phase:** 2
- **Dependencies:** DB-T04
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `lead_history` table stores user-specific lead interactions with embeddings
  2. Records older than 180 days automatically archived (partitioned by `seen_at`)
  3. Query for boomerang candidates returns in < 100ms
  4. User action (dismissed/lost/contacted/no_action) is correctly stored

#### Subtasks:

- Write `006_create_lead_history_table.sql`:
  ```sql
  CREATE TABLE lead_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id),
    embedding VECTOR(1536) NOT NULL,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_action VARCHAR(16),
    source TEXT,
    original_lead_date TIMESTAMPTZ
  );
  CREATE INDEX lead_history_user_id_seen_at_idx ON lead_history(user_id, seen_at DESC);
  CREATE INDEX CONCURRENTLY lead_history_embedding_hnsw_idx
    ON lead_history USING hnsw (embedding vector_cosine_ops)
    WITH (ef_construction = 200, m = 16);
  ```
- Write archival job (DB-T09 prerequisite) to move rows > 180d to cold storage

---

### DB-T06 — Watchlist & Trigger Events Tables

- **ID:** DB-T06
- **Phase:** 2
- **Dependencies:** DB-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `watchlist` table stores user's target companies (max 50 per user enforced at API level)
  2. `trigger_events` table logs detected events per company
  3. Cascade delete when user profile is deleted
  4. Watchlist queries return in < 50ms

#### Subtasks:

- Write `007_create_watchlist_tables.sql`:
  ```sql
  CREATE TABLE watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    company_url TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE trigger_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    event_data JSONB,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    lead_id UUID REFERENCES leads(id)
  );
  ```

---

## Story DB-S03: Scale & Alliance Tables (Phase 3–4)

### DB-T07 — Alliance Members Table

- **ID:** DB-T07
- **Phase:** 3
- **Dependencies:** DB-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `alliance_members` table stores opt-in members with skills and ratings
  2. `alliance_collaborations` table tracks co-bid history
  3. Community rating computed from collaboration history
  4. Verification badge computed automatically after 3+ completed alliances

#### Subtasks:

- Write `008_create_alliance_tables.sql` with `alliance_members`, `alliance_collaborations`, `co_bid_workspaces` tables
- Add rating aggregation view: `alliance_member_stats`
- Add verification status column updated by trigger after 3rd confirmed collaboration

---

### DB-T08 — Lead Table Partitioning by user_id

- **ID:** DB-T08
- **Phase:** 4
- **Dependencies:** DB-T01
- **Estimate:** 5 SP
- **Owner:** DevOps / Backend
- **Acceptance Criteria:**
  1. `lead_scores` table partitioned by `user_id` hash (8 partitions)
  2. Per-user queries show measurable improvement in explain plan
  3. Migration completed without data loss or service interruption
  4. New partitions automatically created as needed

#### Subtasks:

- Plan partition migration: rename existing `lead_scores` to `lead_scores_old`
- Create partitioned `lead_scores` table (PARTITION BY HASH user_id, 8 partitions)
- Backfill data from `lead_scores_old` to new partitioned table
- Validate row counts match, then drop `lead_scores_old`
- Update query planner statistics: `ANALYZE lead_scores`
- Document partition key strategy in architecture docs

---

### DB-T09 — Lead Archival Job (> 180 days)

- **ID:** DB-T09
- **Phase:** 4
- **Dependencies:** DB-T05, INFRA-T02
- **Estimate:** 3 SP
- **Owner:** Backend / DevOps
- **Acceptance Criteria:**
  1. Nightly job moves `lead_history` rows older than 180 days to `lead_history_archive`
  2. Archived rows queryable for boomerang detection (no functional regression)
  3. Primary table stays under 10M rows per user
  4. Job runs without blocking production reads (batched deletes)

#### Subtasks:

- Create `lead_history_archive` table (identical schema, no live indexes)
- Write `ArchivalWorker` BullMQ cron job: runs at 3am UTC
- Implement batched move: `INSERT INTO archive SELECT ... WHERE seen_at < NOW() - INTERVAL '180 days'` in 10k-row batches
- Add test: verify archived rows still queryable, primary table row count decreases

---

### DB-T10 — Read Replica for Analytics Queries

- **ID:** DB-T10
- **Phase:** 4
- **Dependencies:** INFRA-T09
- **Estimate:** 3 SP
- **Owner:** DevOps / Backend
- **Acceptance Criteria:**
  1. RDS read replica provisioned and replication lag < 1 second
  2. All analytics queries (`GET /api/analytics/*`) routed to read replica
  3. Write path (leads ingestion, score writes) still goes through primary
  4. Replica connection pool separate from primary connection pool

#### Subtasks:

- Provision RDS read replica in same AZ as primary
- Configure `READ_REPLICA_DATABASE_URL` environment variable
- Create `readReplicaClient` pg connection pool
- Update analytics query functions to use `readReplicaClient`
- Add replica lag metric to Datadog dashboard
