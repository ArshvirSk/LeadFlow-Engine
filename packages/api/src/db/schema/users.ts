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

const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() { return 'vector(1536)'; },
  toDriver(v: number[]) { return `[${v.join(',')}]`; },
  fromDriver(v: string) { return v.slice(1, -1).split(',').map(Number); },
});

// ─── user_profiles ────────────────────────────────────────────────────────────
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerk_user_id: text('clerk_user_id').notNull().unique(),
    email: text('email').notNull(),
    first_name: text('first_name').notNull().default(''),
    last_name: text('last_name').notNull().default(''),
    avatar_url: text('avatar_url'),
    core_skills: text('core_skills').array().notNull().default([]),
    preferred_skills: text('preferred_skills').array().notNull().default([]),
    experience_years: integer('experience_years').notNull().default(0),
    hourly_rate: numeric('hourly_rate'),
    availability: text('availability').notNull().default('full_time'),
    timezone: text('timezone').notNull().default('America/New_York'),
    portfolio_url: text('portfolio_url'),
    linkedin_url: text('linkedin_url'),
    github_url: text('github_url'),
    preferred_project_types: text('preferred_project_types').array().notNull().default([]),
    preferred_sources: text('preferred_sources').array().notNull().default([]),
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
    slack_monitored_channels: text('slack_monitored_channels').array().notNull().default([]),
    alliance_opt_in: boolean('alliance_opt_in').notNull().default(false),
    filter_hide_red_companies: boolean('filter_hide_red_companies').notNull().default(false),
    phone_number: text('phone_number'),
    phone_verified: boolean('phone_verified').notNull().default(false),
    golden_hour_sms: boolean('golden_hour_sms').notNull().default(false),
    profile_completeness: integer('profile_completeness').notNull().default(0),
    onboarding_completed: boolean('onboarding_completed').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clerkUserIdx: uniqueIndex('user_profiles_clerk_user_id_uniq').on(table.clerk_user_id),
  })
);

// ─── portfolio_pieces ─────────────────────────────────────────────────────────
export const portfolioPieces = pgTable(
  'portfolio_pieces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    url: text('url'),
    skills_demonstrated: text('skills_demonstrated').array().notNull().default([]),
    outcomes: text('outcomes'),
    embedding: vectorType('embedding'),
    embedding_status: text('embedding_status').notNull().default('pending'),
    matched_count: integer('matched_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('portfolio_pieces_user_id_idx').on(table.user_id),
  })
);

// ─── api_keys ─────────────────────────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  key_hash: text('key_hash').notNull().unique(), // SHA-256 hash
  name: text('name').notNull().default('Browser Extension'),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type PortfolioPiece = typeof portfolioPieces.$inferSelect;
export type NewPortfolioPiece = typeof portfolioPieces.$inferInsert;
