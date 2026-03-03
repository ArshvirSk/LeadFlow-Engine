import type { AnalyticsSummary } from '@leadflow/types';
import { subDays } from 'date-fns';
import { and, avg, count, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { leads, leadScores, outreachSends } from '../db/schema/index.js';

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /analytics/summary — ANA-T01 through ANA-T06
  app.get('/analytics/summary', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const since30 = subDays(new Date(), 30);

    // ── 1. Total leads scored in last 30 days ─────────────────────────────
    const [leadsCountRow] = await db
      .select({ count: count() })
      .from(leadScores)
      .where(and(eq(leadScores.user_id, userId), gte(leadScores.created_at, since30)));

    // ── 2. Lead volume by source + avg score ──────────────────────────────
    const bySourceRows = await db
      .select({
        source: leads.source,
        cnt: count(),
        avg_score: avg(leadScores.ai_score),
      })
      .from(leads)
      .innerJoin(leadScores, and(
        eq(leadScores.lead_id, leads.id),
        eq(leadScores.user_id, userId),
        gte(leadScores.created_at, since30),
      ))
      .groupBy(leads.source);

    const by_source: Record<string, number> = {};
    const avg_score_by_source: Record<string, number> = {};
    for (const row of bySourceRows) {
      by_source[row.source] = Number(row.cnt);
      avg_score_by_source[row.source] = Math.round(Number(row.avg_score ?? 0));
    }

    // ── 3. Lead volume by day ─────────────────────────────────────────────
    const byDayResult = await db.execute(sql`
            SELECT DATE(l.ingested_at) AS date, COUNT(*) AS cnt
            FROM   leads l
            INNER  JOIN lead_scores ls
                ON ls.lead_id = l.id AND ls.user_id = ${userId} AND ls.created_at >= ${since30}
            GROUP  BY DATE(l.ingested_at)
            ORDER  BY date ASC
        `);
    const by_day: { date: string; count: number }[] = (byDayResult.rows as any[]).map(r => ({
      date: String(r.date),
      count: Number(r.cnt),
    }));

    // ── 4. Source performance (win rate, response rate, avg score) ────────
    const sourcePerfResult = await db.execute(sql`
            SELECT
                l.source,
                COUNT(*)                                                          AS total,
                COUNT(*) FILTER (WHERE l.status IN ('actioned','contacted','won','lost'))
                                                                                  AS responded,
                COUNT(*) FILTER (WHERE l.status = 'won')                          AS won,
                COUNT(*) FILTER (WHERE l.status IN ('won','lost'))                AS decided,
                AVG(ls.ai_score::numeric)                                         AS avg_score
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
            GROUP  BY l.source
            ORDER  BY total DESC
        `);
    const source_performance = (sourcePerfResult.rows as any[]).map(r => ({
      source: String(r.source),
      total: Number(r.total),
      responded: Number(r.responded),
      won: Number(r.won),
      win_rate: Number(r.decided) > 0 ? Math.round((Number(r.won) / Number(r.decided)) * 100) : 0,
      avg_score: Math.round(Number(r.avg_score ?? 0)),
    }));

    // ── 5. Outreach activity ───────────────────────────────────────────────
    const [outreachCountRow] = await db
      .select({ count: count() })
      .from(outreachSends)
      .where(and(eq(outreachSends.user_id, userId), gte(outreachSends.created_at, since30)));

    const byChannelRows = await db
      .select({ channel: outreachSends.channel, cnt: count() })
      .from(outreachSends)
      .where(and(eq(outreachSends.user_id, userId), gte(outreachSends.created_at, since30)))
      .groupBy(outreachSends.channel);

    const by_channel: Record<string, number> = {};
    for (const r of byChannelRows) by_channel[r.channel] = Number(r.cnt);

    // ── 6. Golden hour stats ──────────────────────────────────────────────
    const ghResult = await db.execute(sql`
            SELECT
                COUNT(*) FILTER (WHERE l.golden_hour = true)                                           AS surfaced,
                COUNT(*) FILTER (WHERE l.golden_hour = true
                                   AND l.status IN ('actioned','contacted','won','lost'))               AS contacted
            FROM   leads l
            INNER  JOIN lead_scores ls
                ON ls.lead_id = l.id AND ls.user_id = ${userId} AND ls.created_at >= ${since30}
        `);
    const gh = (ghResult.rows[0] as any) ?? {};
    const ghSurfaced = Number(gh.surfaced ?? 0);
    const ghContacted = Number(gh.contacted ?? 0);

    const ghBestResult = await db.execute(sql`
            SELECT l.source, COUNT(*) FILTER (WHERE l.status IN ('actioned','contacted','won','lost')) AS hits
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
            WHERE  l.golden_hour = true
            GROUP  BY l.source
            ORDER  BY hits DESC
            LIMIT  1
        `);
    const ghBest: string | null = (ghBestResult.rows[0] as any)?.source ?? null;

    // ── 7. Win / loss ─────────────────────────────────────────────────────
    const wlResult = await db.execute(sql`
            SELECT
                COUNT(*) FILTER (WHERE l.status = 'won')   AS won,
                COUNT(*) FILTER (WHERE l.status = 'lost')  AS lost,
                COUNT(*) FILTER (WHERE l.status NOT IN ('won','lost','actioned','contacted','dismissed','archived')) AS no_reply
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
        `);
    const wl = (wlResult.rows[0] as any) ?? {};
    const totalWon = Number(wl.won ?? 0);
    const totalLost = Number(wl.lost ?? 0);
    const decided = totalWon + totalLost;

    const wlBySourceResult = await db.execute(sql`
            SELECT l.source,
                   COUNT(*) FILTER (WHERE l.status = 'won')  AS won,
                   COUNT(*) FILTER (WHERE l.status = 'lost') AS lost
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
            WHERE  l.status IN ('won','lost')
            GROUP  BY l.source
        `);
    const by_source_wl = (wlBySourceResult.rows as any[]).map(r => ({
      source: String(r.source),
      won: Number(r.won),
      lost: Number(r.lost),
    }));

    const wlByBandResult = await db.execute(sql`
            SELECT
                CASE
                    WHEN ls.ai_score::numeric >= 75 THEN 'high'
                    WHEN ls.ai_score::numeric >= 50 THEN 'medium'
                    ELSE 'low'
                END AS band,
                COUNT(*) FILTER (WHERE l.status = 'won')  AS won,
                COUNT(*) FILTER (WHERE l.status = 'lost') AS lost
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
            WHERE  l.status IN ('won','lost')
            GROUP  BY band
        `);
    const by_score_band = (wlByBandResult.rows as any[]).map(r => ({
      band: String(r.band),
      won: Number(r.won),
      lost: Number(r.lost),
    }));

    // ── 8. Boomerang stats ────────────────────────────────────────────────
    const booResult = await db.execute(sql`
            SELECT
                COUNT(*) FILTER (WHERE l.boomerang = true)                                              AS detected,
                COUNT(*) FILTER (WHERE l.boomerang = true
                                   AND l.status IN ('actioned','contacted','won','lost'))                AS contacted,
                COUNT(*) FILTER (WHERE l.boomerang = true  AND l.status = 'won')                       AS boo_won,
                COUNT(*) FILTER (WHERE l.boomerang = false AND l.status = 'won')                       AS cold_won,
                COUNT(*) FILTER (WHERE l.boomerang = false AND l.status IN ('won','lost'))             AS cold_decided
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
        `);
    const boo = (booResult.rows[0] as any) ?? {};
    const booDetected = Number(boo.detected ?? 0);
    const booContacted = Number(boo.contacted ?? 0);
    const booWon = Number(boo.boo_won ?? 0);
    const coldDecided = Number(boo.cold_decided ?? 0);
    const coldWon = Number(boo.cold_won ?? 0);

    // ── 9. Autopilot stats ────────────────────────────────────────────────
    const apResult = await db.execute(sql`
            SELECT
                COUNT(*) FILTER (WHERE ls.is_autopilot = true)                                          AS evaluated,
                COUNT(*) FILTER (WHERE ls.is_autopilot = true
                                   AND l.status IN ('actioned','contacted','won','lost'))                AS sent,
                COUNT(*) FILTER (WHERE ls.is_autopilot = true  AND l.status = 'won')                   AS ap_won,
                COUNT(*) FILTER (WHERE ls.is_autopilot = false AND l.status = 'won')                   AS manual_won,
                COUNT(*) FILTER (WHERE ls.is_autopilot = false AND l.status IN ('won','lost'))         AS manual_decided
            FROM   leads l
            INNER  JOIN lead_scores ls ON ls.lead_id = l.id AND ls.user_id = ${userId}
        `);
    const ap = (apResult.rows[0] as any) ?? {};
    const apEval = Number(ap.evaluated ?? 0);
    const apSent = Number(ap.sent ?? 0);
    const apWon = Number(ap.ap_won ?? 0);
    const manualDecided = Number(ap.manual_decided ?? 0);
    const manualWon = Number(ap.manual_won ?? 0);

    const summary: AnalyticsSummary = {
      period: '30d',
      lead_volume: {
        total: leadsCountRow.count,
        by_source,
        by_day,
        avg_score_by_source,
      },
      source_performance,
      outreach_activity: {
        drafted: outreachCountRow.count,
        sent: outreachCountRow.count,
        acceptance_rate: 0,
        by_channel,
      },
      golden_hour: {
        total_surfaced: ghSurfaced,
        contacted_within_window: ghContacted,
        hit_rate: ghSurfaced > 0 ? Math.round((ghContacted / ghSurfaced) * 100) : 0,
        missed_quiet_hours: 0,
        best_source: ghBest,
        period_delta: 0,
      },
      win_loss: {
        total_won: totalWon,
        total_lost: totalLost,
        total_no_reply: Number(wl.no_reply ?? 0),
        win_rate: decided > 0 ? Math.round((totalWon / decided) * 100) : 0,
        by_source: by_source_wl,
        by_score_band,
        avg_dimension_scores_won: {},
        avg_dimension_scores_lost: {},
      },
      boomerang: {
        total_detected: booDetected,
        contacted: booContacted,
        won: booWon,
        win_rate: booContacted > 0 ? Math.round((booWon / booContacted) * 100) : 0,
        cold_win_rate: coldDecided > 0 ? Math.round((coldWon / coldDecided) * 100) : 0,
      },
      autopilot: {
        leads_evaluated: apEval,
        leads_approved: apSent,
        leads_sent: apSent,
        win_rate: apSent > 0 ? Math.round((apWon / apSent) * 100) : 0,
        manual_win_rate: manualDecided > 0 ? Math.round((manualWon / manualDecided) * 100) : 0,
        estimated_hours_saved: apSent * 0.5,
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

  // GET /analytics/golden-hours — heatmap data (last 90 days)
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

  // GET /analytics/pattern-report/latest — FR-08 pattern report
  app.get('/analytics/pattern-report/latest', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const result = await db.execute(sql`
            SELECT report, loss_count_at_generation, generated_at
            FROM   pattern_reports
            WHERE  user_id = ${userId}
            ORDER  BY generated_at DESC
            LIMIT  1
        `);
    const row = result.rows[0] as any;
    if (!row) return reply.status(404).send({ error: 'No pattern report yet' });
    return reply.send(row);
  });
}
