# EPIC: L6 — Outreach Generator

**Phase Scope:** 1–4 | **Owner:** AI / Backend
**PRD Reference:** Section 9 — Outreach Generation Layer

---

## Story L6-S01: Core Outreach Infrastructure

_As the system, I generate personalized, channel-specific outreach drafts using the full lead context in a single batched LLM call._

### L6-T01 — OutreachContextBuilder

- **ID:** L6-T01
- **Phase:** 1
- **Dependencies:** L3-T04, L3-T05, PROF-T01
- **Estimate:** 3 SP
- **Owner:** Backend / AI
- **Acceptance Criteria:**
  1. `OutreachContext` object assembled with all 6 required fields from PRD Section 9.2
  2. Context build completes in < 100ms (all data fetched from DB in single query where possible)
  3. Portfolio matches, boomerang context, and trigger event context included when available
  4. Context object is serializable (for queue storage) and has TypeScript type definition

#### Subtasks:

- Define `OutreachContext` type in `packages/types/src/outreach.ts`:
  ```typescript
  export interface OutreachContext {
    lead: Lead; // full normalized lead
    user_profile: UserProfile; // user's profile data
    portfolio_matches: PortfolioPiece[]; // top 2 matched pieces
    boomerang_context?: BoomerangContext; // if boomerang=true
    trigger_event_context?: TriggerEventContext; // if trigger_event set
    outreach_angle: string; // pre-determined opening angle
  }
  ```
- Create `OutreachContextBuilder` service in `packages/workers/src/outreach/OutreachContextBuilder.ts`
- Implement `build(leadId: string, userId: string): Promise<OutreachContext>`
- Single DB query joining leads + lead_scores + portfolio_pieces for context assembly
- Write unit test: verify all fields populated for a lead with full enrichment

---

### L6-T02 — Cold Email Generator

- **ID:** L6-T02
- **Phase:** 1
- **Dependencies:** L6-T01, L3-T02
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Cold email generated within spec: 100–160 words body, subject line includes company + skill angle
  2. Banned phrases absent: 'I am a seasoned', 'I would love to', 'Please find attached', 'Feel free to', 'Hope this email finds you well'
  3. At least one specific detail from the lead description referenced (not generic filler)
  4. Portfolio links injected as plain text URLs (not markdown)

#### Subtasks:

- Create `ColdEmailGenerator` in `packages/workers/src/outreach/generators/ColdEmail.generator.ts`
- Design system prompt:

  ```
  You are writing a cold email for {user.full_name}, a freelance {user.headline}.

  Rules:
  - Subject line: [Company/project name] + [specific skill they need] — keep under 8 words
  - Body: 100–160 words, 3 paragraphs:
    P1: Specific hook referencing exactly what the client posted (1-2 sentences)
    P2: Concrete value you deliver + 1 portfolio example: {portfolio[0].title}: {portfolio[0].url}
    P3: Soft CTA (ask a question or suggest a short call)
  - NEVER use: 'I am a seasoned', 'I would love to', 'Please find attached', 'Feel free to', 'Hope this email finds you well'
  - Tone: {user.tone_preference}
  - Output as JSON: { "subject": "...", "body": "..." }
  ```

- Call `llmProvider.complete()` with context
- Parse JSON response; validate subject < 8 words, body 100–160 words
- Run banned phrase check: `BANNED_PHRASES.some(phrase => body.toLowerCase().includes(phrase))`
- If banned phrase found: re-invoke with stricter instruction (max 1 retry)
- Write unit test: verify spec compliance on sample context

---

### L6-T03 — LinkedIn Message Generator

- **ID:** L6-T03
- **Phase:** 2
- **Dependencies:** L6-T01, L3-T02
- **Estimate:** 2 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Connection note: < 300 characters with relevance hook in line 1
  2. InMail version: < 1,900 characters generated simultaneously
  3. Both versions stored in `outreach_drafts.linkedin` as `{ connection_note, inmail }`
  4. Soft CTA that doesn't sound desperate

#### Subtasks:

- Create `LinkedInMessageGenerator` in `packages/workers/src/outreach/generators/LinkedIn.generator.ts`
- Prompt generates both connection note + InMail in single call (JSON output)
- Validate lengths: connection note ≤ 300 chars, InMail ≤ 1900 chars
- Store as `{ connection_note: string, inmail: string }`
- Write unit test with mock context

---

### L6-T04 — Twitter/X DM Generator

- **ID:** L6-T04
- **Phase:** 2
- **Dependencies:** L6-T01, L3-T02
- **Estimate:** 2 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. DM: < 280 characters, casual tone, 2–3 sentences
  2. References specific tweet or account activity when available (from context)
  3. One portfolio link included (shortest format)
  4. Output validates as ≤ 280 chars after link insertion

#### Subtasks:

- Create `TwitterDMGenerator` in `packages/workers/src/outreach/generators/TwitterDM.generator.ts`
- Prompt emphasizes casual tone, brevity, platform norms
- If `lead.source = 'twitter_search'`: include context about the tweet that triggered detection
- Validate: `generatedDM.length <= 280`
- Write unit test

---

### L6-T05 — Clipboard Pitch Generator

- **ID:** L6-T05
- **Phase:** 2
- **Dependencies:** L6-T01, L3-T02
- **Estimate:** 2 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Pitch: 5–8 lines, tone-neutral (works across all platforms)
  2. Starts with result/outcome (not "I am" or "My name is")
  3. 2–3 portfolio links included as plain URLs
  4. No platform-specific formatting (no markdown, no bullets)

#### Subtasks:

- Create `ClipboardPitchGenerator` in `packages/workers/src/outreach/generators/ClipboardPitch.generator.ts`
- Prompt: "Start with the result or outcome, not your background. 5-8 lines. Works on any platform."
- Inject up to 2 portfolio links
- Validate: 5–8 lines (split on `\n` and count non-empty lines)

---

### L6-T06 — Outreach Quality Validator

- **ID:** L6-T06
- **Phase:** 1
- **Dependencies:** L6-T02
- **Estimate:** 2 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. All 5 banned phrases checked in all 4 outreach formats
  2. Minimum specificity check: at least one word from `lead.skills_required` appears in body
  3. Portfolio URLs present in formats that require them
  4. Validation failures logged with draft content for LLM prompt improvement

#### Subtasks:

- Create `OutreachQualityValidator` in `packages/workers/src/outreach/QualityValidator.ts`
- Define `BANNED_PHRASES = ['i am a seasoned', 'i would love to', 'please find attached', 'feel free to', 'hope this email finds you well']`
- `validateBannedPhrases(content: string): ValidationResult`
- `validateSpecificity(content: string, lead: Lead): ValidationResult` — check skill overlap
- `validatePortfolioLinks(content: string, portfolioUrls: string[]): ValidationResult`
- On validation failure: log and re-queue for regeneration (max 1 retry)
- Write tests for each validation rule

---

### L6-T07 — Batched LLM Call for All 4 Formats

- **ID:** L6-T07
- **Phase:** 2
- **Dependencies:** L6-T02, L6-T03, L6-T04, L6-T05
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. All 4 outreach formats generated in a single LLM call (one large prompt → structured JSON output)
  2. Total generation time < 3 seconds for all 4 formats
  3. Single call reduces API cost by ~60% vs. 4 separate calls
  4. Response parsed into individual format strings reliably

#### Subtasks:

- Design consolidated prompt with JSON output:
  ```json
  {
    "cold_email": { "subject": "...", "body": "..." },
    "linkedin_connection_note": "...",
    "linkedin_inmail": "...",
    "twitter_dm": "...",
    "clipboard_pitch": "..."
  }
  ```
- Refactor individual generators to extract from consolidated response
- Fallback: if consolidated call fails, run individual generators
- Write test: verify all 4 formats returned and spec-compliant in single call

---

### L6-T08 — Outreach Regenerate (Different Angle)

- **ID:** L6-T08
- **Phase:** 2
- **Dependencies:** L6-T07
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. Regenerated draft uses a structurally different opening angle (not a synonym swap)
  2. Previously used angles stored in context to prevent repetition
  3. Regenerated draft passes all quality validations
  4. Available for all 4 formats independently

#### Subtasks:

- Track `used_angles[]` per lead in `lead_scores.score_breakdown`
- Add to prompt: "The following opening angles have already been used — generate a completely different approach: [{used_angles}]"
- Store new angle in used_angles after each generation
- Wire to `POST /api/leads/:id/outreach/regenerate?format=email|linkedin|twitter|clipboard`

---

### L6-T09 — Boomerang-Specific Outreach Opening

- **ID:** L6-T09
- **Phase:** 2
- **Dependencies:** L6-T07, L3-T07
- **Estimate:** 3 SP
- **Owner:** AI / Backend
- **Acceptance Criteria:**
  1. When `lead.boomerang=true`, outreach references historical context
  2. Opening line references: "Last time [company] was looking for this, it was [N] days ago"
  3. Angle conveys unique context advantage over first-time applicants
  4. Works across all 4 outreach formats

#### Subtasks:

- Add boomerang context block to consolidated prompt when `boomerang=true`
- Context includes: original lead date, source, user's previous action, time elapsed
- Validate: opening line mentions historical reference

---

### L6-T10 — Direct Email Send via Resend API

- **ID:** L6-T10
- **Phase:** 4
- **Dependencies:** L6-T02, AUTH-T02
- **Estimate:** 5 SP
- **Owner:** Backend / Full-stack
- **Acceptance Criteria:**
  1. Cold email sent from within LeadFlow without copy-paste
  2. Email sent from user's connected sending domain or LeadFlow default domain
  3. Delivery confirmation returned within 5 seconds
  4. Sent emails logged in `outreach_sends` table for audit

#### Subtasks:

- Install Resend SDK: `@resend/node`
- Create `EmailSendService` in `packages/workers/src/outreach/EmailSendService.ts`
- Implement `send(draft: ColdEmailDraft, to: string, userId: string): Promise<SendResult>`
- Custom domain support: user adds sending domain in settings (Resend DNS verification flow)
- Create `outreach_sends` table: `(id, user_id, lead_id, channel, to_address, subject, body, sent_at, resend_id)`
- Wire to `POST /api/outreach/send` endpoint with channel=email
