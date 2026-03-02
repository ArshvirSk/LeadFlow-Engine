# EPIC: FR-11 — Natural Language Lead Search

**Phase Scope:** 2 (full feature), 4 (voice input) | **Owner:** Full-stack
**PRD Reference:** Section 7, FR-11

---

## Story FR11-S01: NL Parser & Query Builder (Phase 2)

### FR11-T01 — NL Query to Structured Filter — LLM Prompt

- **ID:** FR11-T01
- **Phase:** 2
- **Dependencies:** L3-T01, L3-T02
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Input: natural language string (e.g., "React projects over $5k posted this week")
  2. Output: structured filter JSON:
     ```json
     {
       "skills": ["React"],
       "min_budget": 5000,
       "budget_type": "fixed",
       "max_age_days": 7,
       "source": null,
       "category": null,
       "location": null,
       "min_score": null
     }
     ```
  3. Claude parses query → returns JSON → validated with Zod schema
  4. Unparseable queries return `{ error: "Could not understand query", examples: [...] }`
  5. Latency < 1 second end-to-end (including DB query)

#### Subtasks:

- Create `packages/api/src/services/nlSearch.ts`
- System prompt: defines all available filter fields with types and examples
- Include few-shot examples in prompt: 5 NL queries → expected JSON output
- Claude call with `max_tokens: 200` (only need JSON output — fast + cheap)
- Zod validation: parse Claude's JSON output against FilterSchema
- Error handling: if Zod validation fails → retry once with stricter prompt; then return error

---

### FR11-T02 — Claude API NL Search Integration

- **ID:** FR11-T02
- **Phase:** 2
- **Dependencies:** FR11-T01, L3-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `POST /api/leads/search` accepts `{ query: string }` → calls Claude → returns lead results
  2. Response: `{ filters_applied: {...}, leads: [...], total_count, natural_language_summary }`
  3. `natural_language_summary`: Claude-generated 1-sentence description: "Showing React projects over $5k from the last 7 days"
  4. Cached: same query string → same filter JSON (Redis cache 1h TTL per user+query hash)
  5. Fallback: if Claude unavailable → keyword-based search on `title + description` full-text index

#### Subtasks:

- `POST /api/leads/search` route handler
- Call `nlSearch.parseQuery(query)` → get filter JSON
- Pass filter JSON to existing lead query service
- Generate `natural_language_summary` in same Claude call (add to JSON output schema)
- Cache key: `nl_search:{userId}:{sha256(query)}` TTL 3600
- Fallback: PostgreSQL full-text search: `to_tsvector('english', title || description) @@ plainto_tsquery($1)`

---

### FR11-T03 — Filter JSON to SQL Query Builder

- **ID:** FR11-T03
- **Phase:** 2
- **Dependencies:** FR11-T02
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `FilterJSON → SQL WHERE clause` builder (same used for regular filter bar)
  2. All filter fields mapped to correct SQL expressions:
     - `skills` → `skills_required @> ARRAY[$1]`
     - `min_budget` → `budget >= $1`
     - `max_age_days` → `created_at >= NOW() - INTERVAL '$1 days'`
     - `source` → `source = $1`
     - `min_score` → `ai_score >= $1` (join on `lead_scores`)
  3. Query builder must prevent SQL injection (parameterized queries only)
  4. Supports combination of multiple active filters (AND logic between all fields)

#### Subtasks:

- Create `packages/api/src/services/leadQueryBuilder.ts`
- Map each filter field to parameterized condition
- Accumulate conditions array + params array; join with `AND`
- Base query: `SELECT l.*, ls.ai_score FROM leads l LEFT JOIN lead_scores ls ON l.id = ls.lead_id AND ls.user_id = $userId`
- Execute with `cursor` pagination (existing `GET /api/leads` pagination)
- Unit tests: 15+ filter combinations; verify no SQL injection via parameterization

---

## Story FR11-S02: Search UI (Phase 2)

### FR11-T04 — Cmd+K Search Input Component

- **ID:** FR11-T04
- **Phase:** 2
- **Dependencies:** FR11-T02
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. `Cmd+K` (Mac) / `Ctrl+K` (Windows) opens search modal from anywhere in app
  2. Search modal: full-width input at top, results below in same Lead Card format
  3. Debounced: 400ms after last keypress before API call fires
  4. "Searching…" loading state with pulsing indicator during API call
  5. Results show `natural_language_summary` as a chip below input: "Showing X leads — React projects over $5k"
  6. `Escape` key closes modal; clicking outside closes modal

#### Subtasks:

- Create `NLSearchModal` component (Radix UI `<Dialog>`)
- Global keyboard shortcut: `useKeyboardShortcut(['Meta+k', 'Ctrl+k'])` hook
- `useNLSearch(query: string)` hook: debounced query → `POST /api/leads/search`
- Results list: same `LeadCard` components (no separate component needed)
- `natural_language_summary` chip shown when results loaded
- Keyboard navigation within results: `↑/↓` arrows, `Enter` to open lead

---

### FR11-T05 — Recent Searches Persistence

- **ID:** FR11-T05
- **Phase:** 2
- **Dependencies:** FR11-T04
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Recent searches persisted in `localStorage`: last 10 unique searches
  2. Shown below empty search input when modal opens (before typing)
  3. Click recent search → pre-fills input and fires search immediately
  4. "Clear history" button removes all recent searches
  5. Recent searches deduplicated (same query string not stored twice)

#### Subtasks:

- `useRecentSearches()` hook: read/write to `localStorage['nl_search_history']`
- Storage format: `{ queries: string[], timestamps: number[] }` (store 10 most recent)
- Render `RecentSearchItem` list below input when `query === ''`
- On search execution: add to history (deduplicate + trim to 10)
- "Clear" button: `localStorage.removeItem('nl_search_history')`

---

### FR11-T06 — Error State with Helpful Examples

- **ID:** FR11-T06
- **Phase:** 2
- **Dependencies:** FR11-T04
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. When Claude returns parse error: show friendly message + 3 example queries
  2. Examples are clickable → pre-fill search input
  3. Error does NOT show raw API error message (just "Couldn't understand that — try:")
  4. Three default examples: "React projects over $5k this week", "Python retainers from HN", "Remote full-stack projects any budget"

#### Subtasks:

- `SearchErrorState` component with clickable example queries
- Detect error from API response: `{ error: 'PARSE_ERROR' }`
- 3 examples hardcoded in component (matches few-shot examples in Claude prompt)
- Clicking example: `setQuery(example)` → triggers immediate search (no debounce)

---

### FR11-T07 — Voice Input (Mobile — Phase 4)

- **ID:** FR11-T07
- **Phase:** 4
- **Dependencies:** FR11-T04
- **Estimate:** 5 SP
- **Owner:** Frontend / Mobile
- **Acceptance Criteria:**
  1. Microphone button in search modal on mobile devices
  2. Uses Web Speech API (`SpeechRecognition`) for real-time transcription
  3. Transcribed text auto-fills search input; fires search after pause in speech
  4. Graceful degradation: microphone button hidden when Web Speech API unavailable
  5. Permission request flow: asks for microphone permission with explanation

#### Subtasks:

- Feature detect: `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`
- Show microphone button only on mobile (touch device detection)
- Implement `useSpeechSearch()` hook wrapping Web Speech API
- Auto-submit on `SpeechRecognition` result event (final result)
- Handle `onerror`: show "Microphone unavailable" toast
