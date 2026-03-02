import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { leads } from './leads.js';

// ─── outreach_sends ───────────────────────────────────────────────────────────
export const outreachSends = pgTable(
  'outreach_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // email | linkedin | twitter | clipboard
    draft_content: text('draft_content').notNull(),
    subject: text('subject'),
    portfolio_piece_id: uuid('portfolio_piece_id'),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    status: text('status').notNull().default('draft'),
    is_autopilot: boolean('is_autopilot').notNull().default(false),
    actioned_from_briefing: boolean('actioned_from_briefing').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('outreach_sends_user_id_idx').on(table.user_id),
    leadIdIdx: index('outreach_sends_lead_id_idx').on(table.lead_id),
  })
);

// ─── approval_queue ───────────────────────────────────────────────────────────
export const approvalQueue = pgTable(
  'approval_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: text('user_id').notNull(),
    lead_id: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    drafts: jsonb('drafts'),
    status: text('status').notNull().default('pending'), // pending | approved | skipped | expired
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('approval_queue_user_id_idx').on(table.user_id),
    statusIdx: index('approval_queue_status_idx').on(table.status),
  })
);

export type OutreachSend = typeof outreachSends.$inferSelect;
export type NewOutreachSend = typeof outreachSends.$inferInsert;
export type ApprovalQueueItem = typeof approvalQueue.$inferSelect;
export type NewApprovalQueueItem = typeof approvalQueue.$inferInsert;
