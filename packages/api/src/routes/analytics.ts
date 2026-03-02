import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { leads, leadScores, outreachSends } from '../db/schema/index.js';
import { eq, and, gte, desc, count, avg, sql } from 'drizzle-orm';
import { subDays } from 'date-fns';
import type { AnalyticsSummary } from '@leadflow/types';

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /analytics/summary
  app.get('/analytics/summary', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const since30 = subDays(new Date(), 30);

    const [leadsCountRow] = await db
      .select({ count: count() })
      .from(leadScores)
      .where(and(eq(leadScores.user_id, userId), gte(leadScores.created_at, since30)));

    const [outreachCountRow] = await db
      .select({ count: count() })
      .from(outreachSends)
      .where(and(eq(outreachSends.user_id, userId), gte(outreachSends.created_at, since30)));

    const summary: AnalyticsSummary = {
      period: '30d',
      lead_volume: {
        total: leadsCountRow.count,
        by_source: {},
        by_day: [],
        avg_score_by_source: {},
      },
      source_performance: [],
      outreach_activity: {
        drafted: 0,
        sent: outreachCountRow.count,
        acceptance_rate: 0,
        by_channel: {},
      },
      golden_hour: {
        total_surfaced: 0,
        contacted_within_window: 0,
        hit_rate: 0,
        missed_quiet_hours: 0,
        best_source: null,
        period_delta: 0,
      },
      win_loss: {
        total_won: 0,
        total_lost: 0,
        total_no_reply: 0,
        win_rate: 0,
        by_source: [],
        by_score_band: [],
        avg_dimension_scores_won: {},
        avg_dimension_scores_lost: {},
      },
      boomerang: {
        total_detected: 0,
        contacted: 0,
        won: 0,
        win_rate: 0,
        cold_win_rate: 0,
      },
      autopilot: {
        leads_evaluated: 0,
        leads_approved: 0,
        leads_sent: 0,
        win_rate: 0,
        manual_win_rate: 0,
        estimated_hours_saved: 0,
      },
      briefing: {
        total_sent: 0,
        delivery_rate: 0,
        open_rate: 0,
        action_rate: 0,
        approved_from_briefing: 0,
        won_from_briefing: 0,
      },
    };

    return reply.send(summary);
  });

  // GET /analytics/golden-hours
  app.get('/analytics/golden-hours', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const since90 = subDays(new Date(), 90);

    const rows = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${leads.ingested_at})`,
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${leads.ingested_at})`,
        count: count(),
      })
      .from(leads)
      .innerJoin(leadScores, and(eq(leadScores.lead_id, leads.id), eq(leadScores.user_id, userId)))
      .where(and(eq(leads.golden_hour, true), gte(leads.ingested_at, since90)))
      .groupBy(
        sql`EXTRACT(HOUR FROM ${leads.ingested_at})`,
        sql`EXTRACT(DOW FROM ${leads.ingested_at})`
      );

    return reply.send(rows);
  });
}
