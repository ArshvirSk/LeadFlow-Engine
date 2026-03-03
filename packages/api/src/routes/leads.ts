import { and, desc, eq, getTableColumns, gte, inArray, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { leadHistory, leads, leadScores, userProfiles } from '../db/schema/index.js';
import { debriefQueue, rawLeadsQueue } from '../queues/index.js';
import { NL_SEARCH_EXAMPLES, parseNLQuery } from '../services/nlSearch.js';
import { calculateOptimalSendWindow } from '../services/sendWindow.js';

const FilterSchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(25),
    status: z.enum(['new', 'viewed', 'scored', 'actioned', 'archived', 'dismissed']).optional(),
    minScore: z.coerce.number().min(0).max(100).optional(),
    remote: z.coerce.boolean().optional(),
    goldenHour: z.coerce.boolean().optional(),
    source: z.string().optional(),
    search: z.string().max(200).optional(),
});

export async function leadsRoutes(app: FastifyInstance) {
    // GET /leads — paginated feed
    app.get('/leads', {
        schema: {
            tags: ['leads'],
            querystring: {
                type: 'object',
                properties: {
                    cursor: { type: 'string' },
                    limit: { type: 'number' },
                    status: { type: 'string' },
                    minScore: { type: 'number' },
                    remote: { type: 'boolean' },
                    goldenHour: { type: 'boolean' },
                    source: { type: 'string' },
                    search: { type: 'string' },
                },
            },
        },
    }, async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const filters = FilterSchema.parse(req.query);

        // ── Fetch user profile for personalised filtering ────────────────────────
        const [profile] = await db
            .select({
                preferred_sources: userProfiles.preferred_sources,
                filter_hide_red_companies: userProfiles.filter_hide_red_companies,
            })
            .from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, userId))
            .limit(1);

        // ── Build query conditions ───────────────────────────────────────────────
        const conditions: ReturnType<typeof eq>[] = [];

        if (filters.status) conditions.push(eq(leads.status, filters.status));

        // Score floor: explicit filter wins; otherwise default to 30 to suppress
        // unscored / poorly matched leads (scored leads only via innerJoin below).
        const scoreFloor = filters.minScore ?? 30;
        conditions.push(sql`${leadScores.ai_score} >= ${scoreFloor}`);

        if (filters.remote !== undefined) conditions.push(eq(leads.remote, filters.remote));
        if (filters.goldenHour !== undefined) conditions.push(eq(leads.golden_hour, filters.goldenHour));

        // Explicit source filter wins; otherwise fall back to user's preferred sources.
        if (filters.source) {
            conditions.push(eq(leads.source, filters.source));
        } else if (profile?.preferred_sources?.length) {
            conditions.push(inArray(leads.source, profile.preferred_sources));
        }

        if (filters.cursor) {
            conditions.push(lt(leads.ingested_at, new Date(filters.cursor)));
        }

        // ── Query: innerJoin ensures only leads scored for THIS user appear ───────
        // leftJoin was wrong — it returned every lead in the DB regardless of
        // whether it matched the user's profile (scoring hadn't run yet or
        // the lead belongs to a completely different skill domain).
        const { embedding: _emb, ...leadCols } = getTableColumns(leads);
        const rows = await db
            .select({ leads: leadCols, lead_scores: leadScores })
            .from(leads)
            .innerJoin(
                leadScores,
                and(eq(leadScores.lead_id, leads.id), eq(leadScores.user_id, userId)),
            )
            .where(and(...conditions))
            .orderBy(desc(leads.ingested_at))
            .limit(filters.limit + 1);

        const hasMore = rows.length > filters.limit;
        const data = rows.slice(0, filters.limit);
        const nextCursor = hasMore ? data[data.length - 1].leads.ingested_at.toISOString() : null;

        return reply.send({
            data: data.map(r => ({ ...r.leads, score: r.lead_scores })),
            nextCursor,
            hasMore,
        });
    });

    // GET /leads/:id — auto-advances status 'new' → 'viewed' on first open (L7-T03)
    app.get('/leads/:id', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { id } = req.params as { id: string };

        const [row] = await db
            .select()
            .from(leads)
            .leftJoin(leadScores, and(eq(leadScores.lead_id, leads.id), eq(leadScores.user_id, userId)))
            .where(eq(leads.id, id))
            .limit(1);

        if (!row) return reply.status(404).send({ error: 'Lead not found' });

        // Auto-advance 'new' → 'viewed' so the feed can filter unread leads
        if (row.leads.status === 'new') {
            await db
                .update(leads)
                .set({ status: 'viewed', updated_at: new Date() })
                .where(eq(leads.id, id));
            row.leads.status = 'viewed';
        }

        return reply.send({ ...row.leads, score: row.lead_scores });
    });

    // PATCH /leads/:id/status
    app.patch('/leads/:id/status', {
        schema: {
            body: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
        },
    }, async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { id } = req.params as { id: string };
        const { status } = req.body as { status: string };

        const validStatuses = ['new', 'viewed', 'scored', 'actioned', 'archived', 'dismissed', 'won', 'lost', 'contacted'] as const;
        if (!validStatuses.includes(status as any))
            return reply.status(400).send({ error: 'Invalid status' });

        await db.update(leads).set({ status: status as any, updated_at: new Date() }).where(eq(leads.id, id));

        // ── FR-05: Archive to lead_history on "actioned" / "contacted" ──────────
        if (status === 'actioned' || status === 'contacted') {
            const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
            if (lead) {
                const [score] = await db.select().from(leadScores)
                    .where(and(eq(leadScores.lead_id, id), eq(leadScores.user_id, userId)))
                    .limit(1);

                await db.insert(leadHistory).values({
                    user_id: userId,
                    lead_id: id,
                    lead_snapshot: {
                        title: lead.title,
                        source: lead.source,
                        client_name: lead.client_name,
                        skills_required: lead.skills_required,
                        ai_summary: score?.ai_summary ?? '',
                    },
                    lead_embedding: (lead as any).embedding ?? null,
                    contacted_at: new Date(),
                    outcome: null,
                }).onConflictDoNothing();
            }
        }

        // ── FR-08: Update lead_history outcome on won/lost ───────────────────────
        if (status === 'won' || status === 'lost') {
            // Update the most recent history entry for this lead+user
            await db.execute(sql`
                UPDATE lead_history SET outcome = ${status}
                WHERE  user_id = ${userId}
                  AND  lead_id = ${id}::uuid
                  AND  id = (
                      SELECT id FROM lead_history
                      WHERE  user_id = ${userId} AND lead_id = ${id}::uuid
                      ORDER  BY contacted_at DESC
                      LIMIT  1
                  )
            `);

            // If no history entry yet (user skipped actioned step), create one now
            const [existing] = await db.select({ id: leadHistory.id })
                .from(leadHistory)
                .where(and(eq(leadHistory.user_id, userId), eq(leadHistory.lead_id, id)))
                .limit(1);
            if (!existing) {
                const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
                if (lead) {
                    const [score] = await db.select().from(leadScores)
                        .where(and(eq(leadScores.lead_id, id), eq(leadScores.user_id, userId)))
                        .limit(1);
                    await db.insert(leadHistory).values({
                        user_id: userId,
                        lead_id: id,
                        lead_snapshot: {
                            title: lead.title,
                            source: lead.source,
                            client_name: lead.client_name,
                            skills_required: lead.skills_required,
                            ai_summary: score?.ai_summary ?? '',
                        },
                        lead_embedding: (lead as any).embedding ?? null,
                        contacted_at: new Date(),
                        outcome: status,
                    });
                }
            }

            // ── FR-08: Enqueue debrief generation (5-min delay) ─────────────────
            const [existingScore] = await db.select({ id: leadScores.id, debrief_generated_at: leadScores.debrief_generated_at })
                .from(leadScores)
                .where(and(eq(leadScores.lead_id, id), eq(leadScores.user_id, userId)))
                .limit(1);

            if (existingScore && !existingScore.debrief_generated_at) {
                await debriefQueue.add('debrief', {
                    user_id: userId,
                    lead_id: id,
                    outcome: status as 'won' | 'lost',
                }, {
                    delay: 5 * 60 * 1000, // 5 minutes — allow user to potentially revert
                    jobId: `debrief_${id}_${userId}`,
                    attempts: 3,
                });
            }
        }

        return reply.send({ ok: true });
    });

    // POST /leads/ingest — manual ingestion
    app.post('/leads/ingest', {
        schema: {
            tags: ['leads'],
            body: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        },
    }, async (req, reply) => {
        const { url } = req.body as { url: string };
        const job = await rawLeadsQueue.add('manual', { source: 'manual', source_id: url, url, title: '', description: '', raw_data: {}, ingested_at: new Date().toISOString() });
        return reply.status(202).send({ jobId: job.id });
    });

    // ── POST /leads/search — FR-11 Natural Language Search ───────────────────────
    app.post('/leads/search', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { query } = req.body as { query?: string };

        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return reply.status(400).send({ error: 'query must be at least 2 characters' });
        }

        let filter: Awaited<ReturnType<typeof parseNLQuery>>;
        try {
            filter = await parseNLQuery(userId, query.trim());
        } catch (err: any) {
            if (err.message === 'PARSE_ERROR') {
                return reply.status(422).send({
                    error: 'PARSE_ERROR',
                    message: "Couldn't understand that query",
                    examples: NL_SEARCH_EXAMPLES,
                });
            }
            throw err;
        }

        const conditions: any[] = [];

        if (filter.remote !== null && filter.remote !== undefined) {
            conditions.push(eq(leads.remote, filter.remote));
        }
        if (filter.source) {
            conditions.push(eq(leads.source, filter.source));
        }
        if (filter.min_budget !== null && filter.min_budget !== undefined) {
            conditions.push(sql`${leads.budget}::numeric >= ${filter.min_budget}`);
        }
        if (filter.max_budget !== null && filter.max_budget !== undefined) {
            conditions.push(sql`${leads.budget}::numeric <= ${filter.max_budget}`);
        }
        if (filter.budget_type) {
            conditions.push(eq(leads.budget_type, filter.budget_type));
        }
        if (filter.max_age_days !== null && filter.max_age_days !== undefined) {
            const cutoff = new Date(Date.now() - filter.max_age_days * 86_400_000);
            conditions.push(gte(leads.ingested_at, cutoff));
        }
        if (filter.skills && filter.skills.length > 0) {
            // PostgreSQL array overlap operator &&
            const arrLiteral = `{${filter.skills.map(s => `"${s.replace(/"/g, '\\"')}"`).join(',')}}`;
            conditions.push(sql`${leads.skills_required} && ${arrLiteral}::text[]`);
        }
        if (filter.min_score !== null && filter.min_score !== undefined) {
            conditions.push(sql`${leadScores.ai_score} >= ${filter.min_score}`);
        }

        const { embedding: _emb, ...leadCols } = getTableColumns(leads);
        const rows = await db
            .select({ leads: leadCols, lead_scores: leadScores })
            .from(leads)
            .innerJoin(
                leadScores,
                and(eq(leadScores.lead_id, leads.id), eq(leadScores.user_id, userId)),
            )
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(leads.ingested_at))
            .limit(25);

        return reply.send({
            filters_applied: filter,
            leads: rows.map(r => ({ ...r.leads, score: r.lead_scores ?? null })),
            total_count: rows.length,
            natural_language_summary: filter.natural_language_summary,
        });
    });

    // GET /leads/:id/optimal-send-window — FR-04
    app.get('/leads/:id/optimal-send-window', async (req, reply) => {
        const { id } = req.params as { id: string };
        const [lead] = await db
            .select({ recipient_timezone: leads.recipient_timezone })
            .from(leads)
            .where(eq(leads.id, id))
            .limit(1);
        if (!lead) return reply.status(404).send({ error: 'Not found' });
        const tz = lead.recipient_timezone ?? 'America/New_York';
        return reply.send(calculateOptimalSendWindow(tz));
    });
}
