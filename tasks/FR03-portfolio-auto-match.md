# EPIC: FR-03 — Portfolio Auto-Match

**Phase Scope:** 2 (full feature) | **Owner:** Full-stack
**PRD Reference:** Section 7, FR-03

---

## Story FR03-S01: Portfolio CRUD & Embedding (Phase 2)

### FR03-T01 — Portfolio Pieces Table + CRUD API

_(Implemented as DB-T03 for schema — see DB-database-schema.md)_

- **ID:** FR03-T01
- **Phase:** 2
- **Dependencies:** DB-T03, AUTH-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/portfolio` returns all portfolio pieces for authenticated user
  2. `POST /api/portfolio` creates a new piece; max 20 pieces per user enforced (HTTP 400 if exceeded)
  3. `PUT /api/portfolio/:id` updates title, description, url, skills_demonstrated, outcomes
  4. `DELETE /api/portfolio/:id` removes piece and its embedding
  5. PDF upload: `POST /api/portfolio/upload` accepts PDF (max 5MB) → extract text → auto-fill description

#### Subtasks:

- Create `packages/api/src/routes/portfolio.ts`
- Implement `portfolioService.ts` with CRUD operations on `portfolio_pieces` table
- Enforce 20-piece limit: `SELECT COUNT(*) FROM portfolio_pieces WHERE user_id = $1`
- PDF extraction: `pdf-parse` library → extract first 1000 characters as description
- Validate: `url` must be valid URL; `title` max 100 chars; `description` max 500 chars
- Return updated piece with embedding status: `{ ...piece, embedding_status: 'pending' | 'ready' }`

---

### FR03-T02 — Portfolio Piece Embedding Generation on Save

- **ID:** FR03-T02
- **Phase:** 2
- **Dependencies:** FR03-T01, L3-T03
- **Estimate:** 3 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. On portfolio piece create/update: emit event to BullMQ queue `portfolio.embeddings`
  2. Worker generates embedding from `title + description + skills_demonstrated + outcomes`
  3. Embedding stored in `portfolio_pieces.embedding` (VECTOR(1536))
  4. Piece `embedding_status` updated to `'ready'` after completion
  5. Re-index user's profile embedding after each portfolio update (PROF-T06)

#### Subtasks:

- Create `portfolio-embedding.worker.ts` consuming `portfolio.embeddings` queue
- Input text: `${piece.title}. ${piece.description}. Skills: ${piece.skills_demonstrated.join(', ')}. Outcomes: ${piece.outcomes}`
- Call `openaiProvider.embed(text)` → store in `portfolio_pieces.embedding`
- Update `embedding_status = 'ready'` and `embedding_updated_at = NOW()`
- Enqueue user profile re-embedding job: `profile.embeddings` queue
- Handle embed failure: set `embedding_status = 'failed'`, retry after 5 minutes

---

### FR03-T03 — Portfolio Upload UI

- **ID:** FR03-T03
- **Phase:** 2
- **Dependencies:** FR03-T01, L7-T18
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Drag-and-drop or click-to-browse PDF/link upload in profile settings
  2. Progress indicator while extracting and saving
  3. "Embedding being indexed…" status until `embedding_status = 'ready'`
  4. Portfolio piece card: title, description preview, matched count badge, delete button
  5. Empty state: "Add your first project to unlock AI portfolio matching"

#### Subtasks:

- Create `PortfolioSection` in `packages/web/src/pages/Profile.tsx`
- `PortfolioPieceCard` component with status indicator
- Dropzone using `react-dropzone` for PDF upload
- `usePortfolio` query hook: `GET /api/portfolio`
- `useCreatePortfolio` mutation: `POST /api/portfolio`
- Optimistic UI update while embedding is pending
- Display `matched_count` on each card (how many leads matched this piece)

---

## Story FR03-S02: Matching Pipeline & Outreach Integration (Phase 2)

### FR03-T04 — Portfolio Matching Step in Lead Enrichment

- **ID:** FR03-T04
- **Phase:** 2
- **Dependencies:** FR03-T02, L3-T04, DB-T04
- **Estimate:** 3 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. Portfolio matching runs for every lead during enrichment pipeline
  2. Finds top 3 portfolio pieces by cosine similarity to lead embedding
  3. Threshold: only include matches with cosine similarity ≥ 0.72
  4. Matched pieces stored in `leads.portfolio_matches` (array of portfolio_piece IDs)
  5. Matching must complete in < 100ms using HNSW index

#### Subtasks:

- Add `portfolioMatchingStep` to enrichment pipeline in `L3`
- SQL: `SELECT id, title, 1 - (embedding <=> $1) AS similarity FROM portfolio_pieces WHERE user_id = $2 AND embedding IS NOT NULL ORDER BY embedding <=> $1 LIMIT 3`
- Filter results where similarity >= 0.72
- Update `leads.portfolio_matches = ARRAY[...]` (UUIDs)
- Update `leads.matched_skills` using union of `skills_demonstrated` from matched pieces
- Log matching time to Datadog: `portfolio.match_latency_ms`

---

### FR03-T05 — Portfolio Matches in Outreach Drafts

- **ID:** FR03-T05
- **Phase:** 2
- **Dependencies:** FR03-T04, L6-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `OutreachContext` includes top portfolio match: title, URL, key outcome
  2. LLM prompt instructs model to reference matched portfolio piece naturally (not just append URL)
  3. Draft email: at minimum 1 portfolio reference when match exists and similarity ≥ 0.80
  4. LinkedIn message: include portfolio URL in `<300 chars`

#### Subtasks:

- Update `OutreachContextBuilder` to include `portfolio_matches: PortfolioMatch[]`
- Fetch portfolio piece details for matched IDs before building context
- Update LLM system prompt: "Reference the portfolio project '{title}' naturally within the message"
- Test: generate draft with matched portfolio, verify title/URL appears

---

### FR03-T06 — Manual Portfolio Override in Draft Modal

- **ID:** FR03-T06
- **Phase:** 2
- **Dependencies:** FR03-T05, L7-T17
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Outreach Draft Modal shows "Portfolio Match: {piece.title}" section
  2. User can swap to different portfolio piece from dropdown (shows all 20 pieces)
  3. On swap: re-generate draft with new portfolio piece in context
  4. "No portfolio" option: regenerate without any portfolio reference
  5. Selected portfolio piece persists during current session

#### Subtasks:

- Add `PortfolioMatchSelector` component to `OutreachDraftModal`
- Dropdown shows all pieces with similarity scores
- On change: call `POST /api/leads/:id/outreach/regenerate` with `{ portfolio_piece_id }`
- Loading state while regenerating (skeleton UI)
- "Best match" indicator on auto-selected piece

---

### FR03-T07 — Portfolio Performance Analytics

- **ID:** FR03-T07
- **Phase:** 2
- **Dependencies:** FR03-T06, ANA-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Track: how many leads matched each portfolio piece
  2. Track: which portfolio pieces were included in sent outreach
  3. Track: which portfolio pieces correlated with replies/wins
  4. Analytics API: `GET /api/analytics/portfolio` returns per-piece stats

#### Subtasks:

- Add `portfolio_piece_id` to outreach send log table
- Add `portfolio_match_resulted_in_reply: boolean` to lead_scores
- Analytics query: `GROUP BY portfolio_piece_id` with counts
- Surface in Analytics Dashboard as "Portfolio Performance" table
