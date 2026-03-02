# EPIC: FR-12 — Community Lead Mining

**Phase Scope:** 3 (Slack + Discord), 4 (Telegram) | **Owner:** Backend / Full-stack
**PRD Reference:** Section 7, FR-12

> **Privacy Constraint (DEC-06):** Only hiring-intent messages are retained. All other message content discarded immediately after inference. User must grant explicit workspace consent. See L5-passive-discovery.md for ONNX server-side infrastructure.

---

## Story FR12-S01: Slack Integration (Phase 3)

### FR12-T01 — Slack OAuth Workspace Connection

- **ID:** FR12-T01
- **Phase:** 3
- **Dependencies:** AUTH-T06, DB-T02
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `GET /api/community/slack/connect` starts Slack OAuth 2.0 flow
  2. `GET /api/community/slack/callback` receives code, exchanges for access token
  3. Token stored AES-256-GCM encrypted in `user_profiles.community_tokens JSONB`
  4. Scopes required: `channels:history`, `channels:read`, `im:history` (for DMs opted in)
  5. User can revoke: `DELETE /api/community/slack/disconnect` → removes token + cancels monitoring

#### Subtasks:

- Slack OAuth app registered at api.slack.com; store `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET`
- OAuth flow: redirect to `https://slack.com/oauth/v2/authorize?scope=...`
- Token exchange: `POST https://slack.com/api/oauth.v2.access`
- Encrypt token before storage: `AES256GCM.encrypt(token, USER_ENCRYPTION_KEY)`
- Test: OAuth flow end-to-end in Slack test workspace

---

### FR12-T02 — Slack Events API Channel Monitoring

- **ID:** FR12-T02
- **Phase:** 3
- **Dependencies:** FR12-T01, L5-T11
- **Estimate:** 5 SP
- **Owner:** Backend (Worker)
- **Acceptance Criteria:**
  1. `POST /api/webhooks/slack/events` receives Slack Events API payloads
  2. Handle `message.channels` event: extract message text and pass to ONNX NLP
  3. Hiring intent detected (confidence ≥ 0.80) → create lead from message + context
  4. Non-hiring-intent messages discarded within 50ms of receipt (not stored)
  5. Only monitor channels user has explicitly enabled in Community Settings

#### Subtasks:

- Register Slack Events API endpoint; handle Slack challenge verification
- Verify `X-Slack-Signature` header on every webhook request
- Route message events to `communityMining.processSlackMessage(payload)`
- `processSlackMessage`: extract text → ONNX inference → if intent: create lead
- Lead from Slack: `{ source: 'slack', title: snippet(50 chars), description: message_text, url: slack_message_permalink }`
- Store only the lead, never the raw Slack message
- Allow user to configure monitored channels: `user_profiles.slack_monitored_channels: string[]`

---

## Story FR12-S02: Discord Integration (Phase 3)

### FR12-T03 — Discord Bot Setup & Gateway Connection

- **ID:** FR12-T03
- **Phase:** 3
- **Dependencies:** AUTH-T06
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Discord application + bot registered at discord.com/developers
  2. Bot invite URL generated with `applications.commands` + `bot` + `messages.read` scopes
  3. Discord.js client connects to Gateway and maintains persistent connection
  4. Reconnection handled automatically with exponential backoff
  5. Bot status: "Watching for opportunities" (presence)

#### Subtasks:

- Register Discord app; store `DISCORD_BOT_TOKEN`
- Initialize `discord.js Client` with `GatewayIntentBits.MessageContent` + `Guilds` + `GuildMessages`
- Create `discord-gateway.service.ts` singleton with auto-reconnect
- On disconnect: exponential backoff reconnect: 5s, 10s, 30s, 60s, 120s
- Health check: Datadog ping every 5 minutes; alert on gateway disconnect > 5 minutes

---

### FR12-T04 — Discord Channel Message Monitoring

- **ID:** FR12-T04
- **Phase:** 3
- **Dependencies:** FR12-T03, L5-T11
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. `messageCreate` event handler runs ONNX inference on each new message
  2. Only monitor guilds where at least one LeadFlow user has connected
  3. Hiring intent ≥ 0.80 → create lead with `source: 'discord'`
  4. Rate limiting: max 1000 ONNX inferences per minute per server (prevent overload)
  5. Privacy: never log full message text; only log `{ guild_id, channel_id, intent_confidence }`

#### Subtasks:

- `onMessageCreate(message: Message)`: extract `message.content` → ONNX inference
- Track inference rate in Redis: `discord_inferences:{minute}` counter with 60s TTL
- If `rate >= 1000`: skip remaining messages for that minute (log skip count)
- Lead creation: `{ source: 'discord', title: first 80 chars, description: message_content, url: message.url }`
- Discard `message.content` immediately after lead creation
- Community badge stored: `lead.community_source = { platform: 'discord', server_name, channel_name }`

---

## Story FR12-S03: Telegram Integration (Phase 4)

### FR12-T05 — Telegram Userbot Integration

- **ID:** FR12-T05
- **Phase:** 4
- **Dependencies:** AUTH-T06
- **Estimate:** 5 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. Telegram userbot using GramJS (not a bot — a userbot connected to user's account)
  2. User authenticates with phone number + 2FA code in Community Settings flow
  3. Monitors only groups/channels user has selected
  4. Session string stored AES-256-GCM encrypted in `community_tokens`
  5. All same privacy constraints as Slack/Discord

#### Subtasks:

- Install `telegram` (GramJS) package
- Multi-step auth flow: `SendCode → VerifyCode → (optional 2FA password)`
- Store GramJS session string encrypted
- `TelegramClient.addEventHandler(NewMessage)` for selected chats
- ONNX inference on `NewMessage.message.message` text
- Session monitoring: check session validity daily; re-auth if expired

---

## Story FR12-S04: Community Lead Display (Phase 3)

### FR12-T06 — Community Lead Badge + Channel Attribution

- **ID:** FR12-T06
- **Phase:** 3
- **Dependencies:** FR12-T02, FR12-T04
- **Estimate:** 2 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Community leads display `#channel-name` badge (e.g., `#jobs-and-gigs`)
  2. Platform icon: Slack purple, Discord blurple, Telegram blue
  3. Lead card shows original message context on hover (first 100 chars)
  4. "Competition level" shown as exclusive community leads likely have fewer applicants

#### Subtasks:

- `CommunityBadge` component: platform icon + channel name
- Lead card: show `lead.community_source` data
- `CommunityBadge` tooltip: "Found in #{channel} on {platform}"
- "Competition level": for community leads, show "Low Competition" secondary badge

---

### FR12-T07 — Low Competition Indicator

- **ID:** FR12-T07
- **Phase:** 3
- **Dependencies:** FR12-T06, L3-T04
- **Estimate:** 2 SP
- **Owner:** Backend / Frontend
- **Acceptance Criteria:**
  1. Community-sourced leads (source=slack/discord/telegram) automatically tagged `competition_level: 'low'`
  2. `competition_level` factored into AI score: `competition` factor receives bonus +5 for community leads
  3. Feed badge: "Low Competition" in green below source badge
  4. Analytics: track win rate for community vs. marketplace leads

#### Subtasks:

- `competition_level` field in `leads` table (add via migration)
- Community leads: `competition_level = 'low'` set during normalization
- Scoring: community bonus applied in `L3-T04` competition factor
- Frontend: `LowCompetitionBadge` component on `LeadCard`

---

### FR12-T08 — Community Connections Settings UI

_(Implemented as PROF-T09 — see PROFILE-freelancer-profile.md)_

- **ID:** FR12-T08
- **Phase:** 3
- **Dependencies:** FR12-T01, FR12-T03
- **Estimate:** 5 SP
- **Owner:** Frontend
- **Acceptance Criteria:**
  1. Profile Settings → "Community Connections" section
  2. Slack: "Connect Workspace" OAuth button + connected workspace name + disconnect
  3. Discord: "Add to Server" button + list of joined servers + toggle monitoring per server
  4. Telegram: "Connect Account" multi-step phone auth flow inline
  5. Per-platform: configure which channels/groups to monitor with toggles

#### Subtasks:

- `CommunityConnectionsSection` in Profile Settings
- OAuth buttons linking to `/api/community/{platform}/connect`
- Post-auth: refresh section to show connected platform + channel list
- Channel list with toggle: `PUT /api/community/slack/channels` to update monitored list
- Disconnect button: `DELETE /api/community/{platform}/disconnect`

---

### FR12-T09 — Privacy: Discard Non-Intent Messages

- **ID:** FR12-T09
- **Phase:** 3
- **Dependencies:** FR12-T02, FR12-T04
- **Estimate:** 3 SP
- **Owner:** Backend
- **Acceptance Criteria:**
  1. ALL message processing must discard non-hiring-intent text within 50ms
  2. Audit log: store only `{ platform, channel_id, timestamp, confidence, lead_created: boolean }` (never raw text)
  3. Privacy audit confirms no raw message text stored in database, logs, or Redis
  4. `PRIVACY_AUDIT_MODE=true` env flag enables extra assertions (for testing)

#### Subtasks:

- Code review: verify no `console.log(messageContent)` or similar leaks
- Audit log table: `community_processing_log(id, platform, channel_id, processed_at, confidence, lead_created)` — NO message_text column
- Add `PRIVACY_AUDIT_MODE` flag: when set, assert `message_text NOT IN` any log or Redis key
- Run privacy audit in CI pipeline: automated test that verifies no text leakage
- Document data flow in `PRIVACY.md` with sequence diagram
