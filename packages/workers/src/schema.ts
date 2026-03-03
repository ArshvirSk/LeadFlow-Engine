import { sql } from 'drizzle-orm';
import { boolean, customType, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// ─── pgvector custom type (mirrors packages/api/src/db/schema/leads.ts) ───────
const vectorType = customType<{ data: number[]; driverData: string }>({
    dataType() { return 'vector(1536)'; },
    toDriver(v: number[]) { return `[${v.join(',')}]`; },
    fromDriver(v: string) { return v.slice(1, -1).split(',').map(Number); },
});

// ─── Leads ────────────────────────────────────────────────────────────────────
export const leads = pgTable('leads', {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    source_id: text('source_id'),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    url: text('url').notNull().default(''),
    client_name: text('client_name'),
    client_url: text('client_url'),
    budget: numeric('budget'),
    budget_type: text('budget_type'),
    budget_min: numeric('budget_min'),
    budget_max: numeric('budget_max'),
    skills_required: text('skills_required').array().notNull().default(sql`'{}'::text[]`),
    location: text('location'),
    remote: boolean('remote').notNull().default(false),
    experience_level: text('experience_level'),
    category: text('category'),
    applicant_count: integer('applicant_count'),
    contact_email: text('contact_email'),
    contact_linkedin: text('contact_linkedin'),
    status: text('status').notNull().default('new'),
    golden_hour: boolean('golden_hour').notNull().default(false),
    boomerang: boolean('boomerang').notNull().default(false),
    boomerang_ref: text('boomerang_ref'),
    boomerang_context: jsonb('boomerang_context'),
    company_health: jsonb('company_health'),
    portfolio_matches: jsonb('portfolio_matches'),
    recipient_timezone: text('recipient_timezone'),
    trigger_event: jsonb('trigger_event'),
    community_source: jsonb('community_source'),
    competition_level: text('competition_level'),
    embedding: vectorType('embedding'),
    ingested_at: timestamp('ingested_at').notNull().defaultNow(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Lead Scores ──────────────────────────────────────────────────────────────
export const leadScores = pgTable('lead_scores', {
    id: uuid('id').primaryKey().defaultRandom(),
    lead_id: uuid('lead_id').notNull(),
    user_id: text('user_id').notNull(),
    ai_score: numeric('ai_score').notNull(),
    ai_summary: text('ai_summary').notNull().default(''),
    score_breakdown: jsonb('score_breakdown').$type<Record<string, number>>().notNull().default({}),
    skill_gaps: text('skill_gaps').array().notNull().default(sql`'{}'::text[]`),
    alliance_eligible: boolean('alliance_eligible').notNull().default(false),
    golden_hour_notified_at: timestamp('golden_hour_notified_at'),
    is_autopilot: boolean('is_autopilot').notNull().default(false),
    actioned_from_briefing: boolean('actioned_from_briefing').notNull().default(false), debrief: jsonb('debrief'),
    debrief_generated_at: timestamp('debrief_generated_at'), created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── User Profiles (read-only from workers) ───────────────────────────────────
export const userProfiles = pgTable('user_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    clerk_user_id: text('clerk_user_id').notNull().unique(),
    email: text('email').notNull(),
    first_name: text('first_name').notNull().default(''),
    last_name: text('last_name').notNull().default(''),
    core_skills: text('core_skills').array().notNull().default(sql`'{}'::text[]`),
    preferred_skills: text('preferred_skills').array().notNull().default(sql`'{}'::text[]`),
    experience_years: integer('experience_years').notNull().default(0),
    hourly_rate: numeric('hourly_rate'),
    min_budget: numeric('min_budget'),
    max_budget: numeric('max_budget'),
    timezone: text('timezone').notNull().default('UTC'),
    autopilot_enabled: boolean('autopilot_enabled').notNull().default(false),
    autopilot_rules: jsonb('autopilot_rules'),
    onboarding_completed: boolean('onboarding_completed').notNull().default(false),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Approval Queue (for outreach draft persistence) ─────────────────────────
export const approvalQueue = pgTable('approval_queue', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id').notNull(),
    drafts: jsonb('drafts'),
    status: text('status').notNull().default('pending'),
    expires_at: timestamp('expires_at').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
});

export type InsertLead = typeof leads.$inferInsert;
export type SelectLead = typeof leads.$inferSelect;
export type InsertLeadScore = typeof leadScores.$inferInsert;
export type SelectUserProfile = typeof userProfiles.$inferSelect;

// ─── Portfolio Pieces (for embedding generation) ──────────────────────────────
export const portfolioPieces = pgTable('portfolio_pieces', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    outcomes: text('outcomes'),
    url: text('url'),
    embedding: vectorType('embedding'),
    embedding_status: text('embedding_status').notNull().default('pending'),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Lead History (180-day boomerang store) ───────────────────────────────────
export const leadHistory = pgTable('lead_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id'),
    lead_snapshot: jsonb('lead_snapshot').notNull(),
    lead_embedding: vectorType('lead_embedding'),
    contacted_at: timestamp('contacted_at').notNull(),
    outcome: text('outcome'), // won | lost | no_reply
    archived_at: timestamp('archived_at').notNull().defaultNow(),
});

// ─── Watchlist (for trigger event monitoring) ─────────────────────────────────
export const watchlist = pgTable('watchlist', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    company_name: text('company_name').notNull(),
    company_url: text('company_url'),
    company_crunchbase_id: text('company_crunchbase_id'),
    github_stars_baseline: jsonb('github_stars_baseline'),
    latest_funding_round_at: timestamp('latest_funding_round_at'),
    last_checked_at: timestamp('last_checked_at'),
    created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Trigger Events ───────────────────────────────────────────────────────────
export const triggerEvents = pgTable('trigger_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    watchlist_id: uuid('watchlist_id').notNull(),
    user_id: text('user_id').notNull(),
    company_name: text('company_name').notNull(),
    event_type: text('event_type').notNull(),
    event_date: timestamp('event_date').notNull(),
    event_data: jsonb('event_data').notNull().default({}),
    lead_id: uuid('lead_id'),
    created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Briefing Log ────────────────────────────────────────────────────────────
export const briefingLog = pgTable('briefing_log', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    generated_at: timestamp('generated_at').notNull().defaultNow(),
    delivered_at: timestamp('delivered_at'),
    opened_at: timestamp('opened_at'),
    suppressed: boolean('suppressed').notNull().default(false),
    actions_taken: integer('actions_taken').notNull().default(0),
    channel: text('channel').notNull().default('email'),
    lead_count: integer('lead_count').notNull().default(0),
    content: jsonb('content'),
});

// ─── Outreach Sends (for debrief context) ─────────────────────────────────────
export const outreachSends = pgTable('outreach_sends', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id').notNull(),
    channel: text('channel').notNull(),
    draft_content: text('draft_content').notNull(),
    status: text('status').notNull().default('draft'),
    sent_at: timestamp('sent_at'),
    created_at: timestamp('created_at').notNull().defaultNow(),
});
