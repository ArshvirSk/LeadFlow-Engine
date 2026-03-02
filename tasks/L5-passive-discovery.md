# EPIC: L5 — Passive Discovery Layer

**Phase Scope:** 2–4 | **Owner:** Full-stack / AI
**PRD Reference:** Section 4.1 (L5), FR-10, FR-12

---

## Story L5-S01: Trigger Event Detection

_As a Niche Specialist, I receive proactive leads the moment a Watchlist company hits a milestone._

### L5-T01 — Watchlist Monitoring Worker

- **ID:** L5-T01
- **Phase:** 2
- **Dependencies:** DB-T06, L1-T22, L1-T21
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Worker polls all 5 trigger event types for every user's Watchlist companies every 2 hours
  2. Detected events create a proactive lead with `trigger_event` field populated
  3. Duplicate event detection: same company + event type within 7 days suppressed
  4. Worker handles up to 50 companies per user × 1,000 users = 50,000 checks efficiently (batched)

#### Subtasks:

- Create `WatchlistMonitor` BullMQ worker with `schedule = '0 */2 * * *'`
- Load all watchlist entries from DB, group by company URL for deduplication
- For each company: run all 5 trigger checks in parallel
- On detection: create lead record with `trigger_event` populated, `status = 'proactive'`
- Duplicate suppression: `SELECT 1 FROM trigger_events WHERE watchlist_id=$1 AND event_type=$2 AND detected_at > NOW() - INTERVAL '7 days'`
- Write integration test: mock Crunchbase response, verify proactive lead created

---

### L5-T02 — Trigger: Crunchbase Funding Round Detection

- **ID:** L5-T02
- **Phase:** 2
- **Dependencies:** L5-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Crunchbase API queried for funding round announced within past 48 hours for watchlist companies
  2. Funding amount, round type (Seed/Series A/B), and investors extracted
  3. Proactive lead title: "[Company] just raised [amount] [round]"
  4. Outreach angle: "Congrats on the raise — teams at this stage usually need to move fast on [skill]"

#### Subtasks:

- Implement `FundingRoundDetector` class
- Query Crunchbase API: `GET /v4/entities/organizations/{permalink}?field_ids=funding_rounds`
- Check `announced_on` of most recent round against 48h window
- Extract: `funding_type`, `money_raised`, `investors`
- Create proactive lead with pre-populated `trigger_event = 'funding_round'`
- Cache company data for 6 hours to reduce API calls

---

### L5-T03 — Trigger: Product Hunt Launch Detection

- **ID:** L5-T03
- **Phase:** 2
- **Dependencies:** L5-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Product Hunt API queried for new launches by watchlist companies
  2. Launch detected within 24 hours of posting
  3. Proactive lead includes Product Hunt URL and vote count
  4. Outreach angle: "Saw you launched today — here's how I helped a similar product scale post-launch"

#### Subtasks:

- Implement `ProductHuntLaunchDetector` using Product Hunt API (GraphQL)
- Query: `posts(first: 5, order: NEWEST, after: $cursor)` filtered by maker company
- Match maker names against watchlist company names (fuzzy match, threshold 0.85)
- Create proactive lead with `trigger_event = 'product_launch'`

---

### L5-T04 — Trigger: GitHub Star Milestone Detection

- **ID:** L5-T04
- **Phase:** 2
- **Dependencies:** L5-T01
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. GitHub API polled for watchlist company repos' star counts
  2. Milestone detected: crossing 1k, 5k, 10k, 50k stars
  3. Proactive lead created only once per milestone (not re-triggered)
  4. Outreach angle: "Your repo is growing fast — I specialize in scaling projects at this stage"

#### Subtasks:

- Implement `GitHubMilestoneDetector`
- Use GitHub REST API: `GET /repos/{owner}/{repo}` for star count
- Track last known star count in `trigger_events` table
- Detect milestone crossing: previous < milestone <= current
- Milestones: 1000, 5000, 10000, 50000

---

### L5-T05 — Trigger: Company Blog RSS Monitoring

- **ID:** L5-T05
- **Phase:** 2
- **Dependencies:** L5-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Company blog RSS feed discovered from company URL (look for RSS link in HTML head)
  2. New blog post triggers proactive lead with post content as context
  3. Outreach angle references post content for genuine personalization
  4. RSS discovery cached per company domain

#### Subtasks:

- Implement `BlogRSSDetector`
- Discover RSS: fetch company homepage, parse `<link rel="alternate" type="application/rss+xml">`
- Cache discovered RSS URL per domain in Redis (TTL 7 days)
- Poll RSS, detect new posts since last check
- Create proactive lead with `trigger_event = 'blog_post'`, description includes post title + excerpt

---

## Story L5-S02: Browser Extension Infrastructure (Phase 3)

### L5-T06 — Plasmo Extension Project Scaffold

- **ID:** L5-T06
- **Phase:** 3
- **Dependencies:** INFRA-T01
- **Estimate:** 3 SP
- **Owner:** Frontend / Full-stack
- **Acceptance Criteria:**
  1. Plasmo extension project initialized in `packages/extension/`
  2. Extension builds for Chrome (Manifest V3) from `pnpm build --filter=extension`
  3. Hot reload works in development mode
  4. Extension communicates with API using user's API key (AUTH-T03)

#### Subtasks:

- Run `pnpm create plasmo packages/extension` in monorepo
- Configure Plasmo for React + TypeScript
- Set up environment variable for `PLASMO_PUBLIC_API_URL`
- Build and load unpacked extension in Chrome for smoke test
- Configure API key storage in Chrome extension storage (not localStorage)

---

### L5-T07 — Client-Side Hiring Intent NLP (ONNX WASM)

- **ID:** L5-T07
- **Phase:** 3
- **Dependencies:** L5-T06
- **Estimate:** 8 SP
- **Owner:** AI / Frontend
- **Acceptance Criteria:**
  1. ONNX model loaded in extension background service worker (WASM runtime)
  2. Model classifies text as `hiring_intent: boolean` with confidence score
  3. Trigger phrases detected with > 90% recall against test set of 200 examples
  4. Detection runs in < 100ms on page content (no UI blocking)
  5. No page content transmitted to server — all inference is local

#### Subtasks:

- Evaluate ONNX models: `xenova/distilbert-base-uncased-finetuned-sst-2-english` as base (binary classifier) or fine-tuned intent model
- Alternatively: compile a smaller intent detection model using ONNX Runtime Web
- Bundle ONNX model file (< 50MB target) with extension
- Implement `HiringIntentDetector` class in extension background worker
- Test trigger phrases: 'looking for a dev', 'need help building', 'anyone recommend a freelancer', 'will pay for', 'open to contractors', 'DM me if you', 'hire a developer'
- Benchmark inference time on text snippets of 50–200 words
- Privacy test: verify no network request during inference

---

### L5-T08 — Extension Sidebar UI

- **ID:** L5-T08
- **Phase:** 3
- **Dependencies:** L5-T07
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Sidebar appears 300ms after hiring intent detected with confidence > threshold
  2. Shows: extracted text snippet, detected contact info, 'Capture Lead' + 'Dismiss' buttons
  3. Works on: Twitter/X, LinkedIn, Reddit, Discord (web), Slack (web), HN, IndieHackers
  4. Sidebar does not interfere with host page layout or interactions

#### Subtasks:

- Create `SidebarPanel` React component in Plasmo as a `content.tsx` overlay
- Inject sidebar as shadow DOM element (style isolation)
- Display extracted snippet (max 200 chars), URL, auto-detected contact
- 'Capture Lead' button: POST to `api/leads/capture` with extracted text + URL + contact
- 'Dismiss' button: hide sidebar for current page/session
- Test on all 7 target platforms
- Add 300ms show delay after detection trigger

---

### L5-T09 — Extension Settings Page

- **ID:** L5-T09
- **Phase:** 3
- **Dependencies:** L5-T06
- **Estimate:** 3 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Extension popup shows: connection status, sites enabled/disabled, minimum confidence threshold
  2. Per-site enable/disable stored in Chrome extension storage sync
  3. Confidence threshold slider: 0.5–1.0 (default 0.7)
  4. Link to full LeadFlow dashboard

#### Subtasks:

- Create extension popup page `popup.tsx`
- Show connection status (API key valid/invalid)
- List enabled/disabled sites with toggles
- Confidence threshold slider with live preview
- Store settings in `chrome.storage.sync`

---

## Story L5-S03: Community Lead Mining (Phase 3)

### L5-T10 — Slack Events API Integration

- **ID:** L5-T10
- **Phase:** 3
- **Dependencies:** AUTH-T06, L5-T11
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. User authenticates Slack workspace via OAuth 2.0 (user token, not bot)
  2. User selects which channels to monitor from their workspace
  3. Slack Events API delivers message events to LeadFlow webhook
  4. Up to 5 Slack workspaces per user (Pro+ tier limit)

#### Subtasks:

- Create Slack App at api.slack.com with scopes: `channels:history`, `channels:read`, `im:history`
- Implement OAuth 2.0 flow in Fastify: `/auth/slack`, `/auth/slack/callback`
- Store encrypted tokens in `community_tokens` table (AUTH-T06)
- Create webhook endpoint: `POST /webhooks/slack` to receive message events
- Verify Slack request signature on all webhook deliveries
- User selects channels: `GET /api/community/slack/channels` → list user's accessible channels
- Store monitored channel selections in DB

---

### L5-T11 — Server-Side Community Hiring Intent Detection

- **ID:** L5-T11
- **Phase:** 3
- **Dependencies:** L5-T10
- **Estimate:** 3 SP
- **Owner:** Backend / AI
- **Acceptance Criteria:**
  1. ONNX model runs server-side (Node.js ONNX Runtime, not WASM) on incoming community messages
  2. Messages below confidence threshold discarded immediately (never stored)
  3. Messages above threshold → create lead with `Community` badge and channel context
  4. Original message thread context preserved for in-platform reply

#### Subtasks:

- Install `onnxruntime-node` in workers package
- Load same ONNX model used in browser extension (code sharing via `packages/types`)
- Create `CommunityIntentDetector` service
- On Slack/Discord message event: run inference, discard if confidence < 0.7
- On detection: create lead with `source = 'slack_{workspaceId}_{channelId}'`
- Preserve `thread_ts` (Slack) or `channel_id + message_id` (Discord) for reply context

---

### L5-T12 — Discord Gateway Integration

- **ID:** L5-T12
- **Phase:** 3
- **Dependencies:** AUTH-T06, L5-T11
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. LeadFlow Discord bot added to user's servers via OAuth2 bot invite
  2. Bot receives message events from user-selected channels
  3. Up to 10 Discord servers per user (Pro+ limit)
  4. Bot permissions scoped to minimum required: `READ_MESSAGE_HISTORY`, `VIEW_CHANNEL`

#### Subtasks:

- Create Discord Application + Bot at discord.com/developers
- Implement Discord OAuth2 bot invite flow
- Use `discord.js` Gateway client for persistent WebSocket connection
- Handle reconnection on disconnect (exponential backoff)
- User selects channels: show list of text channels in user's servers
- Store server + channel selections in `community_connections` table

---

### L5-T13 — Telegram Userbot Integration

- **ID:** L5-T13
- **Phase:** 4
- **Dependencies:** AUTH-T06, L5-T11
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. User authenticates Telegram account via MTProto session (GramJS)
  2. System monitors user-selected groups the user is already a member of
  3. Up to 5 Telegram groups per user (Pro+ limit)
  4. Session stored encrypted, never exposed via API

#### Subtasks:

- Use `gramjs` (GramJS) for Telegram MTProto API
- Implement session auth flow: phone number → verification code → session string
- Store session string encrypted in `community_tokens` table
- Subscribe to selected group message events
- Run hiring intent detection on each message
