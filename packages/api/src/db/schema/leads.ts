import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  customType,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── pgvector custom type ─────────────────────────────────────────────────────
const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
});

// ─── leads ────────────────────────────────────────────────────────────────────
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    source_id: text('source_id'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
    client_name: text('client_name'),
    client_url: text('client_url'),
    budget: numeric('budget'),
    budget_type: text('budget_type'), // fixed | hourly | monthly | unknown
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
  },
  (table) => ({
    sourceIdx: index('leads_source_idx').on(table.source),
    statusIdx: index('leads_status_idx').on(table.status),
    ingestedAtIdx: index('leads_ingested_at_idx').on(table.ingested_at),
    goldenHourIdx: index('leads_golden_hour_idx').on(table.golden_hour),
    // HNSW vector index created via raw SQL in migration
    sourceSourceIdUniq: uniqueIndex('leads_source_source_id_uniq').on(
      table.source,
      table.source_id
    ),
  })
);

// ─── lead_scores ──────────────────────────────────────────────────────────────
export const leadScores = pgTable(
  'lead_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lead_id: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull(), // Clerk user ID
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
  },
  (table) => ({
    leadUserUniq: uniqueIndex('lead_scores_lead_user_uniq').on(table.lead_id, table.user_id),
    userIdIdx: index('lead_scores_user_id_idx').on(table.user_id),
    aiScoreIdx: index('lead_scores_ai_score_idx').on(table.ai_score),
  })
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadScore = typeof leadScores.$inferSelect;
export type NewLeadScore = typeof leadScores.$inferInsert;
