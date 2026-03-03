/**
 * Flat schema file for drizzle-kit (avoids .js cross-import resolution issues).
 * This is the single source of truth for `drizzle-kit generate` and `drizzle-kit studio`.
 * The individual schema files in ./schema/ are used by the application at runtime.
 */
import { sql } from 'drizzle-orm';
import {
    boolean,
    customType,
    index,
    integer,
    jsonb,
    numeric,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

// ─── pgvector custom type ─────────────────────────────────────────────────────
const vectorType = customType<{ data: number[]; driverData: string }>({
    dataType() { return 'vector(1536)'; },
    toDriver(v: number[]) { return `[${v.join(',')}]`; },
    fromDriver(v: string) { return v.slice(1, -1).split(',').map(Number); },
});

// ─── leads ────────────────────────────────────────────────────────────────────
export const leads = pgTable('leads', {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    source_id: text('source_id'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
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
    poster_id: text('poster_id'),
    poster_name: text('poster_name'),
    poster_history_score: integer('poster_history_score'),
    applicant_count: integer('applicant_count'),
    contact_email: text('contact_email'),
    contact_linkedin: text('contact_linkedin'),
    status: text('status').notNull().default('new'),
    golden_hour: boolean('golden_hour').notNull().default(false),
    boomerang: boolean('boomerang').notNull().default(false),
    boomerang_ref: uuid('boomerang_ref'),
    boomerang_context: jsonb('boomerang_context'),
    company_health: jsonb('company_health'),
    portfolio_matches: jsonb('portfolio_matches'),
    recipient_timezone: text('recipient_timezone'),
    trigger_event: jsonb('trigger_event'),
    community_source: jsonb('community_source'),
    competition_level: text('competition_level'),
    embedding: vectorType('embedding'),
    ingested_at: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    sourceIdx: index('leads_source_idx').on(t.source),
    statusIdx: index('leads_status_idx').on(t.status),
    ingestedAtIdx: index('leads_ingested_at_idx').on(t.ingested_at),
    goldenHourIdx: index('leads_golden_hour_idx').on(t.golden_hour),
    sourceSourceIdUniq: uniqueIndex('leads_source_source_id_uniq').on(t.source, t.source_id),
}));

// ─── lead_scores ──────────────────────────────────────────────────────────────
export const leadScores = pgTable('lead_scores', {
    id: uuid('id').primaryKey().defaultRandom(),
    lead_id: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull(),
    ai_score: integer('ai_score').notNull().default(0),
    ai_summary: text('ai_summary').notNull().default(''),
    score_breakdown: jsonb('score_breakdown').notNull().default({}),
    skill_gaps: text('skill_gaps').array().notNull().default(sql`'{}'::text[]`),
    alliance_eligible: boolean('alliance_eligible').notNull().default(false),
    debrief: jsonb('debrief'),
    debrief_generated_at: timestamp('debrief_generated_at', { withTimezone: true }),
    golden_hour_notified_at: timestamp('golden_hour_notified_at', { withTimezone: true }),
    golden_hour_responded_at: timestamp('golden_hour_responded_at', { withTimezone: true }),
    scheduled_job_id: text('scheduled_job_id'),
    is_autopilot: boolean('is_autopilot').notNull().default(false),
    actioned_from_briefing: boolean('actioned_from_briefing').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    leadUserUniq: uniqueIndex('lead_scores_lead_user_uniq').on(t.lead_id, t.user_id),
    userIdIdx: index('lead_scores_user_id_idx').on(t.user_id),
    aiScoreIdx: index('lead_scores_ai_score_idx').on(t.ai_score),
}));

// ─── user_profiles ────────────────────────────────────────────────────────────
export const userProfiles = pgTable('user_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    clerk_user_id: text('clerk_user_id').notNull().unique(),
    email: text('email').notNull(),
    first_name: text('first_name').notNull().default(''),
    last_name: text('last_name').notNull().default(''),
    avatar_url: text('avatar_url'),
    core_skills: text('core_skills').array().notNull().default(sql`'{}'::text[]`),
    preferred_skills: text('preferred_skills').array().notNull().default(sql`'{}'::text[]`),
    experience_years: integer('experience_years').notNull().default(0),
    hourly_rate: numeric('hourly_rate'),
    availability: text('availability').notNull().default('full_time'),
    timezone: text('timezone').notNull().default('America/New_York'),
    portfolio_url: text('portfolio_url'),
    linkedin_url: text('linkedin_url'),
    github_url: text('github_url'),
    preferred_project_types: text('preferred_project_types').array().notNull().default(sql`'{}'::text[]`),
    preferred_sources: text('preferred_sources').array().notNull().default(sql`'{}'::text[]`),
    min_budget: numeric('min_budget'),
    max_budget: numeric('max_budget'),
    embedding: vectorType('embedding'),
    notification_settings: jsonb('notification_settings').notNull().default({}),
    autopilot_enabled: boolean('autopilot_enabled').notNull().default(false),
    autopilot_rules: jsonb('autopilot_rules'),
    autopilot_pause_config: jsonb('autopilot_pause_config'),
    auto_send_enabled: boolean('auto_send_enabled').notNull().default(false),
    briefing_delivery_time: text('briefing_delivery_time').notNull().default('07:00'),
    briefing_snooze_until: timestamp('briefing_snooze_until', { withTimezone: true }),
    briefing_channel: text('briefing_channel').notNull().default('email'),
    briefing_email_bounced: boolean('briefing_email_bounced').notNull().default(false),
    community_tokens: jsonb('community_tokens'),
    slack_monitored_channels: text('slack_monitored_channels').array().notNull().default(sql`'{}'::text[]`),
    alliance_opt_in: boolean('alliance_opt_in').notNull().default(false),
    filter_hide_red_companies: boolean('filter_hide_red_companies').notNull().default(false),
    phone_number: text('phone_number'),
    phone_verified: boolean('phone_verified').notNull().default(false),
    golden_hour_sms: boolean('golden_hour_sms').notNull().default(false),
    profile_completeness: integer('profile_completeness').notNull().default(0),
    onboarding_completed: boolean('onboarding_completed').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    clerkUserIdx: uniqueIndex('user_profiles_clerk_user_id_uniq').on(t.clerk_user_id),
}));

// ─── portfolio_pieces ─────────────────────────────────────────────────────────
export const portfolioPieces = pgTable('portfolio_pieces', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    url: text('url'),
    skills_demonstrated: text('skills_demonstrated').array().notNull().default(sql`'{}'::text[]`),
    outcomes: text('outcomes'),
    embedding: vectorType('embedding'),
    embedding_status: text('embedding_status').notNull().default('pending'),
    matched_count: integer('matched_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdIdx: index('portfolio_pieces_user_id_idx').on(t.user_id),
}));

// ─── api_keys ─────────────────────────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    key_hash: text('key_hash').notNull().unique(),
    name: text('name').notNull().default('Browser Extension'),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── outreach_sends ───────────────────────────────────────────────────────────
export const outreachSends = pgTable('outreach_sends', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    draft_content: text('draft_content').notNull(),
    subject: text('subject'),
    portfolio_piece_id: uuid('portfolio_piece_id'),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    status: text('status').notNull().default('draft'),
    is_autopilot: boolean('is_autopilot').notNull().default(false),
    actioned_from_briefing: boolean('actioned_from_briefing').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdIdx: index('outreach_sends_user_id_idx').on(t.user_id),
    leadIdIdx: index('outreach_sends_lead_id_idx').on(t.lead_id),
}));

// ─── approval_queue ───────────────────────────────────────────────────────────
export const approvalQueue = pgTable('approval_queue', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    drafts: jsonb('drafts'),
    status: text('status').notNull().default('pending'),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdIdx: index('approval_queue_user_id_idx').on(t.user_id),
    statusIdx: index('approval_queue_status_idx').on(t.status),
}));

// ─── lead_history ─────────────────────────────────────────────────────────────
export const leadHistory = pgTable('lead_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    lead_snapshot: jsonb('lead_snapshot').notNull(),
    lead_embedding: vectorType('lead_embedding'),
    contacted_at: timestamp('contacted_at', { withTimezone: true }).notNull(),
    outcome: text('outcome'),
    similarity_threshold: numeric('similarity_threshold'),
    boomerang_source_lead_id: uuid('boomerang_source_lead_id'),
    archived_at: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdIdx: index('lead_history_user_id_idx').on(t.user_id),
    archivedAtIdx: index('lead_history_archived_at_idx').on(t.archived_at),
}));

// ─── watchlist ────────────────────────────────────────────────────────────────
export const watchlist = pgTable('watchlist', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    company_name: text('company_name').notNull(),
    company_url: text('company_url'),
    company_crunchbase_id: text('company_crunchbase_id'),
    notes: text('notes'),
    github_stars_baseline: jsonb('github_stars_baseline'),
    latest_funding_round_at: timestamp('latest_funding_round_at', { withTimezone: true }),
    last_blog_post_url: text('last_blog_post_url'),
    last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdIdx: index('watchlist_user_id_idx').on(t.user_id),
}));

// ─── trigger_events ───────────────────────────────────────────────────────────
export const triggerEvents = pgTable('trigger_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    watchlist_id: uuid('watchlist_id').references(() => watchlist.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull(),
    company_name: text('company_name').notNull(),
    event_type: text('event_type').notNull(),
    event_date: timestamp('event_date', { withTimezone: true }).notNull(),
    event_data: jsonb('event_data').notNull().default({}),
    lead_id: uuid('lead_id').references(() => leads.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    userIdIdx: index('trigger_events_user_id_idx').on(t.user_id),
}));

// ─── pattern_reports ──────────────────────────────────────────────────────────
export const patternReports = pgTable('pattern_reports', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    report: jsonb('report').notNull(),
    loss_count_at_generation: numeric('loss_count_at_generation').notNull(),
    generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── briefing_log ─────────────────────────────────────────────────────────────
export const briefingLog = pgTable('briefing_log', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    opened_at: timestamp('opened_at', { withTimezone: true }),
    suppressed: boolean('suppressed').notNull().default(false),
    suppressed_at: timestamp('suppressed_at', { withTimezone: true }),
    suppress_reason: text('suppress_reason'),
    actions_taken: integer('actions_taken').notNull().default(0),
    channel: text('channel').notNull().default('email'),
    lead_count: integer('lead_count').notNull().default(0),
    content: jsonb('content'),
}, (t) => ({
    userIdIdx: index('briefing_log_user_id_idx').on(t.user_id),
    generatedAtIdx: index('briefing_log_generated_at_idx').on(t.generated_at),
}));

// ─── community_processing_log ─────────────────────────────────────────────────
export const communityProcessingLog = pgTable('community_processing_log', {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: text('platform').notNull(),
    channel_id: text('channel_id').notNull(),
    message_id: text('message_id').notNull(),
    processed_at: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
    confidence: numeric('confidence'),
    lead_created: boolean('lead_created').notNull().default(false),
    lead_id: uuid('lead_id'),
}, (t) => ({
    platformChannelIdx: index('community_log_platform_channel_idx').on(t.platform, t.channel_id),
    processedAtIdx: index('community_log_processed_at_idx').on(t.processed_at),
}));
