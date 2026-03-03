import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ─── briefing_log ─────────────────────────────────────────────────────────────
export const briefingLog = pgTable(
  'briefing_log',
  {
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
  },
  (table) => ({
    userIdIdx: index('briefing_log_user_id_idx').on(table.user_id),
    generatedAtIdx: index('briefing_log_generated_at_idx').on(table.generated_at),
  })
);

// ─── community_processing_log ─────────────────────────────────────────────────
// NOTE: NO message_text column — we never persist raw community messages (privacy)
export const communityProcessingLog = pgTable(
  'community_processing_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: text('platform').notNull(),
    channel_id: text('channel_id').notNull(),
    message_id: text('message_id').notNull(),
    processed_at: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
    confidence: numeric('confidence'),
    lead_created: boolean('lead_created').notNull().default(false),
    lead_id: uuid('lead_id'),
  },
  (table) => ({
    platformChannelIdx: index('community_log_platform_channel_idx').on(table.platform, table.channel_id),
    processedAtIdx: index('community_log_processed_at_idx').on(table.processed_at),
  })
);

export type BriefingLog = typeof briefingLog.$inferSelect;
export type NewBriefingLog = typeof briefingLog.$inferInsert;
export type CommunityProcessingLog = typeof communityProcessingLog.$inferSelect;
