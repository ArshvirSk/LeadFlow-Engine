import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  customType,
  index,
} from 'drizzle-orm/pg-core';
import { leads } from './leads.js';

const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() { return 'vector(1536)'; },
  toDriver(v: number[]) { return `[${v.join(',')}]`; },
  fromDriver(v: string) { return v.slice(1, -1).split(',').map(Number); },
});

// ─── lead_history (180-day boomerang store) ───────────────────────────────────
export const leadHistory = pgTable(
  'lead_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    lead_snapshot: jsonb('lead_snapshot').notNull(),
    lead_embedding: vectorType('lead_embedding'),
    contacted_at: timestamp('contacted_at', { withTimezone: true }).notNull(),
    outcome: text('outcome'), // won | lost | no_reply
    similarity_threshold: numeric('similarity_threshold'),
    boomerang_source_lead_id: uuid('boomerang_source_lead_id'),
    archived_at: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('lead_history_user_id_idx').on(table.user_id),
    archivedAtIdx: index('lead_history_archived_at_idx').on(table.archived_at),
    // HNSW index on lead_embedding created via raw SQL in migration
  })
);

// ─── watchlist ────────────────────────────────────────────────────────────────
export const watchlist = pgTable(
  'watchlist',
  {
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
  },
  (table) => ({
    userIdIdx: index('watchlist_user_id_idx').on(table.user_id),
  })
);

// ─── trigger_events ───────────────────────────────────────────────────────────
export const triggerEvents = pgTable(
  'trigger_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watchlist_id: uuid('watchlist_id').references(() => watchlist.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull(),
    company_name: text('company_name').notNull(),
    event_type: text('event_type').notNull(),
    event_date: timestamp('event_date', { withTimezone: true }).notNull(),
    event_data: jsonb('event_data').notNull().default({}),
    lead_id: uuid('lead_id').references(() => leads.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('trigger_events_user_id_idx').on(table.user_id),
  })
);

// ─── pattern_reports ──────────────────────────────────────────────────────────
export const patternReports = pgTable('pattern_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  report: jsonb('report').notNull(),
  loss_count_at_generation: numeric('loss_count_at_generation').notNull(),
  generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LeadHistory = typeof leadHistory.$inferSelect;
export type NewLeadHistory = typeof leadHistory.$inferInsert;
export type Watchlist = typeof watchlist.$inferSelect;
export type TriggerEvent = typeof triggerEvents.$inferSelect;
