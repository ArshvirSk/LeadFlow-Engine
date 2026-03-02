import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { leads, leadScores } from '../db/schema/index.js';
import { rawLeadsQueue } from '../queues/index.js';

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

        // Base conditions on the leads table
        const conditions: ReturnType<typeof eq>[] = [];
        if (filters.status) conditions.push(eq(leads.status, filters.status));
        if (filters.minScore !== undefined)
            conditions.push(sql`${leadScores.ai_score} >= ${filters.minScore}`);
        if (filters.remote !== undefined) conditions.push(eq(leads.remote, filters.remote));
        if (filters.goldenHour !== undefined) conditions.push(eq(leads.golden_hour, filters.goldenHour));
        if (filters.source) conditions.push(eq(leads.source, filters.source));
        if (filters.cursor) {
            conditions.push(lt(leads.ingested_at, new Date(filters.cursor)));
        }

        // leftJoin so leads without scores (not yet scored) still appear
        const rows = await db
            .select()
            .from(leads)
            .leftJoin(
                leadScores,
                and(eq(leadScores.lead_id, leads.id), eq(leadScores.user_id, userId)),
            )
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(leads.ingested_at))
            .limit(filters.limit + 1);

        const hasMore = rows.length > filters.limit;
        const data = rows.slice(0, filters.limit);
        const nextCursor = hasMore ? data[data.length - 1].leads.ingested_at.toISOString() : null;

        return reply.send({
            data: data.map(r => ({ ...r.leads, score: r.lead_scores ?? null })),
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

        const validStatuses = ['new', 'viewed', 'scored', 'actioned', 'archived', 'dismissed'] as const;
        if (!validStatuses.includes(status as any))
            return reply.status(400).send({ error: 'Invalid status' });

        await db.update(leads).set({ status: status as any, updated_at: new Date() }).where(eq(leads.id, id));
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
}
