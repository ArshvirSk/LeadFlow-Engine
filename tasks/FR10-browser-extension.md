# EPIC: FR-10 — Browser Extension

**Phase Scope:** 3 (Chrome), 4 (Firefox) | **Owner:** Full-stack / Extension
**PRD Reference:** Section 7, FR-10

> **Technical Note:** Uses Plasmo framework for cross-browser extension development. See L5-passive-discovery.md for underlying ONNX infrastructure tasks (L5-T06 through L5-T09).

---

## Story FR10-S01: Extension Scaffold & NLP Engine (Phase 3)

### FR10-T01 — Plasmo Extension Project Scaffold

_(Implemented as L5-T06 — see L5-passive-discovery.md)_

- **ID:** FR10-T01
- **Phase:** 3
- **Dependencies:** INFRA-T01
- **Estimate:** 3 SP
- **Owner:** Frontend / Extension
- **Acceptance Criteria:**
  1. `packages/extension` initialized with Plasmo framework: `pnpm create plasmo`
  2. Build outputs: `extension/build/chrome-mv3` (Manifest V3) for Chrome
  3. Content script, background service worker, and popup page all scaffolded
  4. Shares types from `packages/types` (monorepo symlink)
  5. Hot reload working in dev mode: `plasmo dev`

#### Subtasks:

- Run `pnpm create plasmo --with-react` in `packages/extension`
- Configure Plasmo to use `packages/types` symlink
- Set `manifest.json` permissions: `storage`, `activeTab`, `alarms`
- Content script: `contents/lead-detector.tsx` (injected into job boards + LinkedIn + Twitter)
- Background service worker: `background.ts` (handles API calls, storage)
- Popup: `popup.tsx` (user settings + quick stats)

---

### FR10-T02 — ONNX Model Selection & Bundling

_(Implemented as L5-T07 — see L5-passive-discovery.md)_

- **ID:** FR10-T02
- **Phase:** 3
- **Dependencies:** FR10-T01
- **Estimate:** 5 SP
- **Owner:** Backend / ML
- **Acceptance Criteria:**
  1. ONNX model selected: quantized BERT variant < 5MB for WASM deployment
  2. Model bundled with Plasmo build (not fetched at runtime — offline capability)
  3. ONNX Runtime WASM loaded in extension service worker: `onnxruntime-web`
  4. Model inference: binary classification → `{ hiring_intent: boolean, confidence: 0-1 }`
  5. Inference time < 100ms on M1 Mac; < 200ms on mid-range Windows hardware

#### Subtasks:

- Research and select quantized hiring-intent ONNX model (or fine-tune DistilBERT)
- Model file: `public/models/hiring_intent.onnx` (≤5MB)
- Load model in background service worker using ONNX Runtime WASM
- `inferHiringIntent(text: string): Promise<{ hiring_intent: boolean, confidence: number }>`
- Benchmark inference time: log `onnx.inference_time_ms` per call
- Add model to `.gitignore` if > 50MB; provide download script in README

---

### FR10-T03 — Client-Side Hiring Intent Detection (Content Script)

- **ID:** FR10-T03
- **Phase:** 3
- **Dependencies:** FR10-T02
- **Estimate:** 8 SP
- **Owner:** Extension
- **Acceptance Criteria:**
  1. Content script injects on supported sites: LinkedIn, Twitter, Slack web, Reddit, HN
  2. Detects job/hiring-intent text in page content using ONNX model
  3. Detection triggered on: page load AND DOM mutation (MutationObserver for SPAs)
  4. 300ms delay after DOM change before inference (avoid false triggers during typing)
  5. Detection results sent to background service worker via Chrome messaging API
  6. ZERO full-page data transmitted — only detected text snippets (privacy requirement)

#### Subtasks:

- Implement `MutationObserver` in content script for SPA navigation detection
- Text extraction: target semantic selectors (`article`, `[data-testid]`, `.post-content`)
- Chunk text into 512-token windows before inference
- Chrome messaging: `chrome.runtime.sendMessage({ type: 'hiring_intent_detected', data: { snippet, url, confidence } })`
- Throttle: max 1 inference per 3 seconds per tab (avoid CPU thrash)
- Privacy: never send more than 200 characters of the detected snippet to API

---

## Story FR10-S02: Sidebar UI & API Capture (Phase 3)

### FR10-T04 — Extension Sidebar UI Component

_(Implemented as L5-T08 — see L5-passive-discovery.md)_

- **ID:** FR10-T04
- **Phase:** 3
- **Dependencies:** FR10-T03
- **Estimate:** 5 SP
- **Owner:** Frontend / Extension
- **Acceptance Criteria:**
  1. Sidebar appears at right edge of browser when hiring intent detected (confidence ≥ 0.75)
  2. Shadow DOM isolation: extension styles NEVER affect host page styles
  3. Sidebar content: detected lead summary + AI score (fetched from API) + "Capture Lead" button
  4. 300ms slide-in animation; sidebar width 320px; appears only on detection (not on every page)
  5. "Dismiss" button: hides sidebar for 24h on current domain

#### Subtasks:

- Plasmo content UI (shadow DOM): `contents/Sidebar.tsx` with `getShadowHostId`
- Trigger: background SW receives `hiring_intent_detected` → sends `show_sidebar` message
- Sidebar component: loading skeleton → fetch lead data from API → show summary
- CSS isolation using Plasmo shadow DOM (no style leakage)
- Dismiss: `chrome.storage.local.set({ dismissedDomains: [..., currentDomain, dismissedUntil] })`

---

### FR10-T05 — POST /api/leads/capture Endpoint

_(Implemented as FR10-T05 in L5 — see L5-passive-discovery.md)_

- **ID:** FR10-T05
- **Phase:** 3
- **Dependencies:** FR10-T04, AUTH-T03, L2-T01
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `POST /api/leads/capture` accepts extension API key (not Clerk JWT — different auth)
  2. Payload: `{ url, title, snippet, source: 'browser_extension', userId }`
  3. Lead injected into normalization pipeline: `raw.leads` queue
  4. Response: `{ leadId, status: 'processing' }` (async — don't block on scoring)
  5. Rate limit: 100 captures per user per day (prevent abuse)

#### Subtasks:

- Add API key validation middleware to `/api/leads/capture` (bypasses Clerk JWT)
- Validate extension API key from `api_keys` table
- Map captured payload to raw lead format: `{ source: 'browser_extension', url, title, description: snippet }`
- Enqueue to `raw.leads` queue
- Daily capture counter in Redis: `ext_captures:{userId}:{date}` with 24h TTL

---

### FR10-T06 — Extension Settings Popup

_(Implemented as L5-T09 — see L5-passive-discovery.md)_

- **ID:** FR10-T06
- **Phase:** 3
- **Dependencies:** FR10-T04
- **Estimate:** 3 SP
- **Owner:** Frontend / Extension
- **Acceptance Criteria:**
  1. Extension toolbar popup: login status, enabled/disabled toggle, sensitivity slider
  2. Sensitivity: Low (≥0.90 confidence), Medium (≥0.75, default), High (≥0.60)
  3. Site-specific disable: toggle detection off for current domain
  4. Quick stats: "Captured today: X | This week: Y"
  5. "Open Dashboard" link → opens LeadFlow dashboard in new tab

#### Subtasks:

- `popup.tsx` Plasmo page
- Connect to dashboard: store `LEADFLOW_API_KEY` in `chrome.storage.local`
- Settings saved to extension storage and synced to API profile
- Stats: `GET /api/extension/stats` returns daily/weekly capture counts
- Site disable list stored in extension local storage

---

## Story FR10-S03: Privacy, Publishing & Firefox (Phase 3-4)

### FR10-T07 — Privacy Audit & Compliance

- **ID:** FR10-T07
- **Phase:** 3
- **Dependencies:** FR10-T05
- **Estimate:** 3 SP
- **Owner:** Backend / Legal
- **Acceptance Criteria:**
  1. Privacy review confirms: no full page content ever transmitted to API
  2. Only `{ url, title, 200-char snippet }` sent — verified with network proxy test
  3. `privacy-policy.md` updated to reflect extension data collection
  4. Extension permissions minimized: only `activeTab`, `storage`, `alarms` requested
  5. Chrome Web Store privacy practices form completed and accurate

#### Subtasks:

- Network proxy test (Charles/Fiddler): verify payload size from extension during detection
- Audit code: search for any `document.body.innerText` → replace with targeted selectors
- Document data flow: extension README must include privacy statement
- Update `packages/extension/PRIVACY.md`
- Prepare Chrome Web Store developer account and privacy practices declaration

---

### FR10-T08 — Chrome Web Store Submission

- **ID:** FR10-T08
- **Phase:** 3
- **Dependencies:** FR10-T07
- **Estimate:** 3 SP
- **Owner:** Product / DevOps
- **Acceptance Criteria:**
  1. Extension packaged and submitted to Chrome Web Store for review
  2. Store listing: description, 5 screenshots, promo tile (440x280)
  3. Version 1.0.0 passes Chrome review (typically 1-7 business days)
  4. Automated build + publish pipeline: `pnpm build:extension` → zip → upload via CWS API

#### Subtasks:

- Configure Plasmo build for production: `pnpm build --target=chrome-mv3`
- Set up CWS developer account; complete identity verification
- Prepare store assets: screenshots, promotional images, icon set (16/32/48/128px)
- Store description: focus on privacy-first, no data selling
- Set up GitHub Actions workflow: tag `ext-v*` → build → upload to CWS draft

---

### FR10-T09 — Firefox Extension Build

- **ID:** FR10-T09
- **Phase:** 4
- **Dependencies:** FR10-T01
- **Estimate:** 3 SP
- **Owner:** Extension
- **Acceptance Criteria:**
  1. Plasmo `--target=firefox-mv2` build succeeds without errors
  2. Content scripts and background page work identically to Chrome
  3. ONNX Runtime WASM loads correctly in Firefox (Manifest V2 background page)
  4. Submitted to Firefox Add-ons (AMO) and passes review

#### Subtasks:

- Run `plasmo build --target=firefox-mv2`
- Fix any MV2 vs MV3 API differences (Chrome `service_worker` → Firefox `background.scripts`)
- Test on Firefox Nightly
- AMO submission: create AMO developer account, upload .xpi
- Automated build: extend GitHub Actions workflow for Firefox target
